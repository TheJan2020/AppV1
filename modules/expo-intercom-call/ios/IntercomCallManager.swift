import AVFoundation
import CallKit
import Foundation
import PushKit
import UIKit

final class IntercomCallManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
  static let shared = IntercomCallManager()

  private let defaults = UserDefaults.standard
  private let callController = CXCallController()
  private var provider: CXProvider?
  private var pushRegistry: PKPushRegistry?
  private var started = false
  private var currentUUID: UUID?
  private var currentCallId = ""
  private var currentLabel = "Front door"

  var emit: ((String, [String: Any]) -> Void)?

  private enum Keys {
    static let voipToken = "pw.intercom.voipToken"
    static let pending = "pw.intercom.pending"
    static let adminUrl = "pw.intercom.adminUrl"
    static let userId = "pw.intercom.userId"
    static let userName = "pw.intercom.userName"
  }

  func start() {
    if started { return }
    started = true
    let config = CXProviderConfiguration(localizedName: "Primewave")
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    let next = CXProvider(configuration: config)
    next.setDelegate(self, queue: DispatchQueue.main)
    provider = next

    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
  }

  func configure(adminUrl: String, userId: String, userName: String) {
    defaults.set(adminUrl, forKey: Keys.adminUrl)
    defaults.set(userId, forKey: Keys.userId)
    defaults.set(userName, forKey: Keys.userName)
    if let token = voipToken(), !token.isEmpty {
      postVoipRegister(token)
    }
  }

  func voipToken() -> String? {
    defaults.string(forKey: Keys.voipToken)
  }

  func hasPending() -> Bool {
    defaults.dictionary(forKey: Keys.pending) != nil
  }

  func consumePending() -> [String: Any]? {
    guard let pending = defaults.dictionary(forKey: Keys.pending) else { return nil }
    defaults.removeObject(forKey: Keys.pending)
    return pending
  }

  func reportIncoming(callId: String, label: String, event: String = "ringing", completion: (() -> Void)? = nil) {
    start()
    let trimmed = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    let uuid = UUID(uuidString: trimmed) ?? UUID()
    let name = label.trimmingCharacters(in: .whitespacesAndNewlines)
    let display = name.isEmpty ? "Front door" : name

    if event != "ringing" {
      let uuid = UUID(uuidString: trimmed) ?? currentUUID
      if let uuid {
        if currentUUID != uuid {
          let update = CXCallUpdate()
          update.remoteHandle = CXHandle(type: .generic, value: display)
          update.localizedCallerName = display
          update.hasVideo = false
          provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] _ in
            self?.provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            completion?()
          }
          return
        }
        endCall(reason: .remoteEnded)
      }
      completion?()
      return
    }

    currentUUID = uuid
    currentCallId = trimmed.isEmpty ? uuid.uuidString : trimmed
    currentLabel = display
    storePending(action: "incoming")

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: display)
    update.localizedCallerName = display
    update.hasVideo = false
    update.supportsDTMF = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false

    provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      if let error {
        NSLog("[IntercomCall] CallKit report failed: %@", error.localizedDescription)
      } else {
        self?.emit?("onIncoming", [
          "callId": self?.currentCallId ?? "",
          "label": display,
          "event": "ringing",
        ])
      }
      completion?()
    }
  }

  func endCall(reason: CXCallEndedReason = .remoteEnded) {
    guard let uuid = currentUUID else {
      defaults.removeObject(forKey: Keys.pending)
      return
    }
    provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
    currentUUID = nil
    currentCallId = ""
  }

  func requestEndFromJs() {
    guard let uuid = currentUUID else { return }
    let end = CXEndCallAction(call: uuid)
    let tx = CXTransaction(action: end)
    callController.request(tx) { _ in }
  }

  private func storePending(action: String) {
    defaults.set([
      "action": action,
      "callId": currentCallId,
      "label": currentLabel,
    ], forKey: Keys.pending)
  }

  private func payloadMap(_ payload: PKPushPayload) -> [String: Any] {
    var out: [String: Any] = [:]
    for (key, value) in payload.dictionaryPayload {
      if let key = key as? String {
        out[key] = value
      }
    }
    return out
  }

  private func postVoipRegister(_ voipToken: String, attempt: Int = 1) {
    let admin = defaults.string(forKey: Keys.adminUrl) ?? ""
    guard !admin.isEmpty else {
      if attempt < 8 {
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt) * 1.5) { [weak self] in
          self?.postVoipRegister(voipToken, attempt: attempt + 1)
        }
      }
      return
    }
    var root = admin
    if !root.hasSuffix("/") { root += "/" }
    guard let url = URL(string: "\(root)api/notifications/register") else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.timeoutInterval = 8
    let userId = defaults.string(forKey: Keys.userId) ?? ""
    let body: [String: Any] = [
      "token": "voip:\(voipToken)",
      "voipToken": voipToken,
      "platform": "ios",
      "deviceName": UIDevice.current.name,
      "userId": userId,
    ]
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: req) { _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      if let error {
        NSLog("[IntercomCall] voip register failed: %@", error.localizedDescription)
      } else {
        NSLog("[IntercomCall] voip register status=%d attempt=%d", status, attempt)
      }
      if status != 200 && attempt < 6 {
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt) * 1.5) { [weak self] in
          self?.postVoipRegister(voipToken, attempt: attempt + 1)
        }
      }
    }.resume()
  }

  private func postNative(_ path: String, body: [String: Any]) {
    let admin = defaults.string(forKey: Keys.adminUrl) ?? ""
    guard !admin.isEmpty else { return }
    var root = admin
    if !root.hasSuffix("/") { root += "/" }
    guard let url = URL(string: "\(root)api/intercom/\(path)") else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.timeoutInterval = 8
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: req).resume()
  }

  private func prepareAudio() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
    )
    try? session.setActive(true)
  }

  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = credentials.token.map { String(format: "%02.2hhx", $0) }.joined()
    defaults.set(token, forKey: Keys.voipToken)
    emit?("onVoipToken", ["token": token])
    postVoipRegister(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    defaults.removeObject(forKey: Keys.voipToken)
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let data = payloadMap(payload)
    let event = String(describing: data["event"] ?? "ringing")
    let callId = String(describing: data["callId"] ?? "")
    let label = String(describing: data["label"] ?? "Front door")
    reportIncoming(callId: callId, label: label, event: event, completion: completion)
  }

  func providerDidReset(_ provider: CXProvider) {
    currentUUID = nil
    currentCallId = ""
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    prepareAudio()
    storePending(action: "answer")
    emit?("onAnswer", [
      "callId": currentCallId,
      "label": currentLabel,
    ])
    let userId = defaults.string(forKey: Keys.userId) ?? ""
    let userName = defaults.string(forKey: Keys.userName) ?? ""
    if !userId.isEmpty || !userName.isEmpty {
      postNative("answer", body: [
        "userId": userId,
        "username": userName,
        "userName": userName,
      ])
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    let endingId = currentCallId
    let pendingAction = defaults.dictionary(forKey: Keys.pending)?["action"] as? String
    let wasAnswered = pendingAction == "answer"
    if !wasAnswered {
      storePending(action: "decline")
      emit?("onDecline", ["callId": endingId, "label": currentLabel])
      let userId = defaults.string(forKey: Keys.userId) ?? ""
      postNative("decline", body: ["userId": userId])
    } else {
      emit?("onHangup", ["callId": endingId])
      postNative("hangup", body: ["reason": "hangup"])
    }
    currentUUID = nil
    currentCallId = ""
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    prepareAudio()
  }
}
