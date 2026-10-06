package expo.modules.intercomcall

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

internal object IntercomCallNotifier {
  const val CHANNEL_ID = "intercom_incoming_v2"
  const val NOTIFICATION_ID = 71001
  private const val LEGACY_CHANNEL_ID = "intercom_incoming"

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.deleteNotificationChannel(LEGACY_CHANNEL_ID)
    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: Settings.System.DEFAULT_RINGTONE_URI
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Door intercom calls",
      NotificationManager.IMPORTANCE_HIGH
    )
    channel.description = "Incoming door calls when the phone is locked"
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 800, 400, 800, 400, 800, 400, 800, 400, 800)
    channel.setSound(ringtone, attrs)
    channel.setBypassDnd(true)
    channel.lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  fun show(context: Context, callId: String, label: String) {
    ensureChannel(context)
    val app = context.applicationContext
    val fullScreen = PendingIntent.getActivity(
      app,
      0,
      IncomingCallActivity.intent(app, callId, label),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val content = PendingIntent.getActivity(
      app,
      1,
      IncomingCallActivity.intent(app, callId, label),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(app, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_call)
      .setContentTitle(label)
      .setContentText("Someone is at the door")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(fullScreen, true)
      .setContentIntent(content)
      .setTimeoutAfter(90_000)
      .build()
    NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, notification)
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context.applicationContext).cancel(NOTIFICATION_ID)
  }
}
