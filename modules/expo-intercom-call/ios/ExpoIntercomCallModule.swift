import ExpoModulesCore

public class ExpoIntercomCallModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoIntercomCall")

    Events("onVoipToken", "onIncoming", "onAnswer", "onDecline", "onHangup")

    OnCreate {
      IntercomCallManager.shared.start()
      IntercomCallManager.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    Function("isAvailable") { () -> Bool in
      true
    }

    Function("configure") { (adminUrl: String, userId: String, userName: String) in
      IntercomCallManager.shared.configure(adminUrl: adminUrl, userId: userId, userName: userName)
    }

    Function("getVoipToken") { () -> String? in
      IntercomCallManager.shared.voipToken()
    }

    Function("hasPending") { () -> Bool in
      IntercomCallManager.shared.hasPending()
    }

    Function("consumePending") { () -> [String: Any]? in
      IntercomCallManager.shared.consumePending()
    }

    Function("reportIncoming") { (callId: String, label: String) in
      IntercomCallManager.shared.reportIncoming(callId: callId, label: label, event: "ringing")
    }

    Function("endCall") { (reason: String) in
      IntercomCallManager.shared.endCall(named: reason)
    }
  }
}
