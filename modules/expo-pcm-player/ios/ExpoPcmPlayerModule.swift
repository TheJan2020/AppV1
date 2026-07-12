import ExpoModulesCore
import AVFoundation
import AudioToolbox

/// Streams 16-bit LE mono PCM to AVAudioPlayerNode (Gemini Live replies @ 24 kHz).
private final class PcmEngine {
  static let shared = PcmEngine()

  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var format: AVAudioFormat?
  private var sessionReady = false
  private var preferredRoute: String = "SPEAKER"
  private var routeObserver: NSObjectProtocol?
  private let lock = NSLock()

  var onRouteChange: (([String: Any]) -> Void)?

  func routeInfo() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    var bluetoothConnected = false
    var wiredHeadset = false
    var outputName = ""
    var outputType = ""

    for output in session.currentRoute.outputs {
      outputName = output.portName
      outputType = output.portType.rawValue
      if Self.isBluetoothPort(output.portType) {
        bluetoothConnected = true
      }
      if Self.isWiredHeadsetPort(output.portType) {
        wiredHeadset = true
      }
    }

    for input in session.availableInputs ?? [] {
      if Self.isBluetoothPort(input.portType) {
        bluetoothConnected = true
        if outputName.isEmpty {
          outputName = input.portName
          outputType = input.portType.rawValue
        }
      }
      if Self.isWiredHeadsetPort(input.portType) {
        wiredHeadset = true
      }
    }

    let hasExternal = bluetoothConnected || wiredHeadset
    return [
      "bluetoothConnected": bluetoothConnected,
      "wiredHeadset": wiredHeadset,
      "hasExternalAudio": hasExternal,
      "outputName": outputName,
      "outputType": outputType,
      "preferredRoute": preferredRoute,
    ]
  }

  private static func isBluetoothPort(_ type: AVAudioSession.Port) -> Bool {
    type == .bluetoothHFP || type == .bluetoothA2DP || type == .bluetoothLE
  }

  private static func isWiredHeadsetPort(_ type: AVAudioSession.Port) -> Bool {
    type == .headphones || type == .headsetMic
  }

  func beginRouteMonitoring() {
    if routeObserver != nil { return }
    routeObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] _ in
      guard let self else { return }
      self.onRouteChange?(self.routeInfo())
    }
  }

  func endRouteMonitoring() {
    if let routeObserver {
      NotificationCenter.default.removeObserver(routeObserver)
      self.routeObserver = nil
    }
  }

  /// One stable session category for the whole call.
  /// Mid-call we only flip speaker override + preferred input — never recreate the category,
  /// or the mic stream breaks and Gemini closes with 1007 / CONTENT_TYPE_AUDIO.
  private func activateSession() throws {
    let session = AVAudioSession.sharedInstance()
    // HFP covers AirPods / BT headsets with mic. Avoid A2DP here — it can switch the
    // session into a media content type and break duplex voice (Gemini 1007).
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetoothHFP, .defaultToSpeaker]
    )
    try session.setActive(true)
  }

  private func applyOutputRoute(_ route: String) throws {
    let session = AVAudioSession.sharedInstance()
    let useSpeaker = route.uppercased() == "SPEAKER"
    preferredRoute = useSpeaker ? "SPEAKER" : "HEADSET"

    if useSpeaker {
      try session.overrideOutputAudioPort(.speaker)
      if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
        try? session.setPreferredInput(builtIn)
      }
    } else {
      // Clear speaker override → iOS routes to BT / wired / earpiece.
      try session.overrideOutputAudioPort(.none)
      if let btInput = session.availableInputs?.first(where: { Self.isBluetoothPort($0.portType) }) {
        try? session.setPreferredInput(btInput)
      } else if let wiredMic = session.availableInputs?.first(where: { $0.portType == .headsetMic }) {
        try? session.setPreferredInput(wiredMic)
      }
    }

    #if DEBUG
    let outs = session.currentRoute.outputs.map { "\($0.portType.rawValue):\($0.portName)" }.joined(separator: ",")
    print("[ExpoPcmPlayer] route=\(preferredRoute) outputs=[\(outs)]")
    #endif
  }

  func prepare(sampleRate: Double) throws {
    lock.lock()
    defer { lock.unlock() }
    stopLocked(keepRouteMonitor: true)

    try activateSession()
    try applyOutputRoute(preferredRoute)
    sessionReady = true
    beginRouteMonitoring()

    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()
    engine.attach(player)

    guard let format = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: true
    ) else {
      throw NSError(domain: "ExpoPcmPlayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid audio format"])
    }

    engine.connect(player, to: engine.mainMixerNode, format: format)
    engine.mainMixerNode.outputVolume = 1.0
    player.volume = 1.0
    try engine.start()
    player.play()

    self.engine = engine
    self.player = player
    self.format = format
  }

  func playPcm(base64: String) throws {
    lock.lock()
    defer { lock.unlock() }

    guard let data = Data(base64Encoded: base64),
          let format = format,
          let player = player else { return }

    let frames = UInt32(data.count / 2)
    guard frames > 0,
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
    buffer.frameLength = frames

    data.withUnsafeBytes { raw in
      guard let base = raw.baseAddress,
            let dst = buffer.int16ChannelData?[0] else { return }
      let src = base.assumingMemoryBound(to: Int16.self)
      dst.update(from: src, count: Int(frames))
    }

    player.scheduleBuffer(buffer, completionHandler: nil)
  }

  func setRoute(_ route: String) throws {
    lock.lock()
    defer { lock.unlock() }

    let normalized = route.uppercased() == "SPEAKER" ? "SPEAKER" : "HEADSET"
    preferredRoute = normalized

    // Allow setting preferred route before prepare(); apply immediately if live.
    guard sessionReady else { return }

    // Soft switch only — do not recreate category/mode (breaks live mic → Gemini 1007).
    try applyOutputRoute(normalized)

    if let engine = engine, let player = player {
      if !engine.isRunning {
        try engine.start()
      }
      if !player.isPlaying {
        player.play()
      }
    }
  }

  func stop() {
    lock.lock()
    defer { lock.unlock() }
    stopLocked(keepRouteMonitor: false)
  }

  private func stopLocked(keepRouteMonitor: Bool) {
    if !keepRouteMonitor {
      endRouteMonitoring()
    }
    player?.stop()
    engine?.stop()
    player = nil
    engine = nil
    format = nil
    sessionReady = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

public class ExpoPcmPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPcmPlayer")

    Events("onAudioRouteChange")

    OnStartObserving {
      PcmEngine.shared.onRouteChange = { [weak self] info in
        self?.sendEvent("onAudioRouteChange", info)
      }
      PcmEngine.shared.beginRouteMonitoring()
    }

    OnStopObserving {
      PcmEngine.shared.onRouteChange = nil
      PcmEngine.shared.endRouteMonitoring()
    }

    AsyncFunction("getAudioRouteInfo") { () -> [String: Any] in
      PcmEngine.shared.routeInfo()
    }

    AsyncFunction("prepare") { (sampleRate: Double) in
      try PcmEngine.shared.prepare(sampleRate: sampleRate)
    }

    AsyncFunction("playPcm") { (base64: String) in
      try PcmEngine.shared.playPcm(base64: base64)
    }

    AsyncFunction("stop") {
      PcmEngine.shared.stop()
    }

    AsyncFunction("setRoute") { (route: String) in
      try PcmEngine.shared.setRoute(route)
    }

    AsyncFunction("playRing") {
      DispatchQueue.main.async {
        AudioServicesPlaySystemSound(1005)
      }
    }
  }
}
