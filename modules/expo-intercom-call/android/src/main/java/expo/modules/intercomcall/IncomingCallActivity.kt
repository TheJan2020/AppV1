package expo.modules.intercomcall

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class IncomingCallActivity : Activity() {
  private var callId = ""
  private var label = "Front door"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    turnScreenOn()
    readIntent(intent)
    IntercomCallStore.setPending(this, "incoming", callId, label)
    ExpoIntercomCallModule.emit("onIncoming", mapOf("callId" to callId, "label" to label, "event" to "ringing"))
    setContentView(
      buildUi(),
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    )
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    if (intent != null) {
      setIntent(intent)
      readIntent(intent)
    }
  }

  private fun readIntent(intent: Intent) {
    callId = intent.getStringExtra(EXTRA_CALL_ID).orEmpty()
    label = intent.getStringExtra(EXTRA_LABEL)?.ifBlank { "Front door" } ?: "Front door"
  }

  private fun turnScreenOn() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      keyguard.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildUi(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.parseColor("#09091A"))
      setPadding(48, 96, 48, 96)
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    }
    val kicker = TextView(this).apply {
      text = "INCOMING"
      setTextColor(Color.parseColor("#73FFFFFF"))
      textSize = 12f
      gravity = Gravity.CENTER
      letterSpacing = 0.16f
    }
    val title = TextView(this).apply {
      text = label
      setTextColor(Color.WHITE)
      textSize = 32f
      gravity = Gravity.CENTER
      setPadding(0, 16, 0, 0)
    }
    val sub = TextView(this).apply {
      text = "Someone is at the door"
      setTextColor(Color.parseColor("#99FFFFFF"))
      textSize = 16f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 72)
    }
    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    val decline = Button(this).apply {
      text = "Decline"
      setBackgroundColor(Color.parseColor("#C62828"))
      setTextColor(Color.WHITE)
      setOnClickListener { onDecline() }
    }
    val answer = Button(this).apply {
      text = "Answer"
      setBackgroundColor(Color.parseColor("#2E7D32"))
      setTextColor(Color.WHITE)
      setOnClickListener { onAnswer() }
    }
    val gap = View(this).apply {
      layoutParams = LinearLayout.LayoutParams(36, 1)
    }
    val btnLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    actions.addView(decline, btnLp)
    actions.addView(gap)
    actions.addView(answer, btnLp)
    root.addView(kicker)
    root.addView(title)
    root.addView(sub)
    root.addView(actions)
    return root
  }

  private fun onAnswer() {
    IntercomCallStore.setPending(this, "answer", callId, label)
    IntercomCallNotifier.cancel(this)
    ExpoIntercomCallModule.emit("onAnswer", mapOf("callId" to callId, "label" to label))
    val body = JSONObject()
      .put("userId", IntercomCallStore.userId(this))
      .put("username", IntercomCallStore.userName(this))
      .put("userName", IntercomCallStore.userName(this))
    postNative("answer", body)
    openApp()
    finish()
  }

  private fun onDecline() {
    IntercomCallStore.setPending(this, "decline", callId, label)
    IntercomCallNotifier.cancel(this)
    ExpoIntercomCallModule.emit("onDecline", mapOf("callId" to callId, "label" to label))
    postNative("decline", JSONObject().put("userId", IntercomCallStore.userId(this)))
    finish()
  }

  private fun openApp() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    startActivity(launch)
  }

  private fun postNative(path: String, body: JSONObject) {
    val admin = IntercomCallStore.adminUrl(this).trim()
    if (admin.isEmpty()) return
    val root = if (admin.endsWith("/")) admin else "$admin/"
    thread {
      try {
        val conn = URL("${root}api/intercom/$path").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        conn.inputStream.close()
        conn.disconnect()
      } catch (_: Exception) {
        // JS will retry after the app is open
      }
    }
  }

  companion object {
    private const val EXTRA_CALL_ID = "callId"
    private const val EXTRA_LABEL = "label"

    fun intent(context: Context, callId: String, label: String): Intent {
      return Intent(context, IncomingCallActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_CALL_ID, callId)
        putExtra(EXTRA_LABEL, label)
      }
    }
  }
}
