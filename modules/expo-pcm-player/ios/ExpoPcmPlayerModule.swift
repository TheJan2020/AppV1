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
  private let lock = NSLock()

  func prepare(sampleRate: Double) throws {
    lock.lock()
    defer { lock.unlock() }
    stopLocked()

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetooth, .defaultToSpeaker]
    )
    try session.setActive(true)
    sessionReady = true

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

  /// Switch loudspeaker vs earpiece (call only after prepare).
  func setRoute(_ route: String) throws {
    lock.lock()
    defer { lock.unlock() }
    guard sessionReady else { return }

    let session = AVAudioSession.sharedInstance()
    if route == "SPEAKER" {
      try session.overrideOutputAudioPort(.speaker)
    } else {
      try session.overrideOutputAudioPort(.none)
    }
  }

  func stop() {
    lock.lock()
    defer { lock.unlock() }
    stopLocked()
  }

  private func stopLocked() {
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
