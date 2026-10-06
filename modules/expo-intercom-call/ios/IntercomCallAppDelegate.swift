import ExpoModulesCore
import UIKit

public class IntercomCallAppDelegate: ExpoAppDelegateSubscriber {
  public func subscriberDidRegister() {
    IntercomCallManager.shared.start()
  }

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    IntercomCallManager.shared.start()
    return true
  }
}
