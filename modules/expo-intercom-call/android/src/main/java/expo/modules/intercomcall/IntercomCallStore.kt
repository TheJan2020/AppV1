package expo.modules.intercomcall

import android.content.Context
import org.json.JSONObject

internal object IntercomCallStore {
  private const val PREFS = "pw.intercom.call"
  private const val PENDING = "pending"
  private const val ADMIN = "adminUrl"
  private const val USER = "userId"
  private const val NAME = "userName"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(context: Context, adminUrl: String, userId: String, userName: String) {
    prefs(context).edit()
      .putString(ADMIN, adminUrl)
      .putString(USER, userId)
      .putString(NAME, userName)
      .apply()
  }

  fun adminUrl(context: Context) = prefs(context).getString(ADMIN, "") ?: ""
  fun userId(context: Context) = prefs(context).getString(USER, "") ?: ""
  fun userName(context: Context) = prefs(context).getString(NAME, "") ?: ""

  fun setPending(context: Context, action: String, callId: String, label: String) {
    val json = JSONObject()
      .put("action", action)
      .put("callId", callId)
      .put("label", label)
      .toString()
    prefs(context).edit().putString(PENDING, json).apply()
  }

  fun hasPending(context: Context): Boolean =
    prefs(context).contains(PENDING)

  fun consumePending(context: Context): Map<String, Any>? {
    val raw = prefs(context).getString(PENDING, null) ?: return null
    prefs(context).edit().remove(PENDING).apply()
    return try {
      val json = JSONObject(raw)
      mapOf(
        "action" to json.optString("action"),
        "callId" to json.optString("callId"),
        "label" to json.optString("label"),
      )
    } catch (_: Exception) {
      null
    }
  }
}
