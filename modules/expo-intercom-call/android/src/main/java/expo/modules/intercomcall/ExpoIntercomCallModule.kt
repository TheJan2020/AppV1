package expo.modules.intercomcall

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoIntercomCallModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoIntercomCall")

    Events("onVoipToken", "onIncoming", "onAnswer", "onDecline", "onHangup")

    OnCreate {
      emitter = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      emitter = null
    }

    Function("isAvailable") {
      true
    }

    Function("configure") { adminUrl: String, userId: String, userName: String ->
      val context = appContext.reactContext ?: appContext.currentActivity ?: return@Function null
      IntercomCallStore.configure(context, adminUrl, userId, userName)
    }

    Function("getVoipToken") {
      null as String?
    }

    Function("hasPending") {
      val context = appContext.reactContext ?: appContext.currentActivity
      context != null && IntercomCallStore.hasPending(context)
    }

    Function("consumePending") {
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) null else IntercomCallStore.consumePending(context)
    }

    Function("reportIncoming") { callId: String, label: String ->
      val context = currentContext() ?: return@Function null
      IntercomCallStore.setPending(context, "incoming", callId, label)
      IntercomCallNotifier.show(context, callId, label)
      try {
        context.startActivity(IncomingCallActivity.intent(context, callId, label))
      } catch (_: Exception) {
        // Full-screen notification still launches the activity on a locked phone
      }
    }

    Function("endCall") {
      val context = currentContext() ?: return@Function null
      IntercomCallNotifier.cancel(context)
      IntercomCallStore.consumePending(context)
    }
  }

  private fun currentContext(): Context? {
    return appContext.reactContext ?: appContext.currentActivity
  }

  companion object {
    @Volatile
    private var emitter: ((String, Map<String, Any>) -> Unit)? = null

    fun emit(name: String, body: Map<String, Any>) {
      emitter?.invoke(name, body)
    }
  }
}
