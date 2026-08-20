package expo.modules.pcmplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

/**
 * Streams 16-bit LE mono PCM (Gemini Live replies @ 24 kHz) through AudioTrack.
 */
class ExpoPcmPlayerModule : Module() {
  private val engine = PcmEngine()

  override fun definition() = ModuleDefinition {
    Name("ExpoPcmPlayer")

    Events("onAudioRouteChange")

    OnCreate {
      engine.attach(appContext.reactContext ?: appContext.currentActivity)
      engine.onRouteChange = { info ->
        sendEvent("onAudioRouteChange", info)
      }
    }

    OnDestroy {
      engine.onRouteChange = null
      engine.stop()
    }

    OnStartObserving {
      engine.beginRouteMonitoring()
    }

    OnStopObserving {
      engine.endRouteMonitoring()
    }

    AsyncFunction("getAudioRouteInfo") {
      engine.routeInfo()
    }

    AsyncFunction("prepare") { sampleRate: Double ->
      engine.prepare((appContext.reactContext ?: appContext.currentActivity), sampleRate.toInt())
    }

    AsyncFunction("playPcm") { base64: String ->
      engine.playPcm(base64)
    }

    AsyncFunction("stop") {
      engine.stop()
    }

    AsyncFunction("clearPlayback") {
      engine.clearPlayback()
    }

    AsyncFunction("setRoute") { route: String ->
      engine.setRoute(route)
    }

    AsyncFunction("playRing") {
      // Visual ring is handled in JS; no-op on Android.
    }
  }
}

private class PcmEngine {
  private val lock = Any()
  private val running = AtomicBoolean(false)
  private val queue = LinkedBlockingQueue<ByteArray>(48)
  private var track: AudioTrack? = null
  private var writer: Thread? = null
  private var appContext: Context? = null
  private var preferredRoute: String = "SPEAKER"
  private var routeReceiver: BroadcastReceiver? = null
  var onRouteChange: ((Map<String, Any>) -> Unit)? = null

  fun attach(context: Context?) {
    if (context != null) {
      appContext = context.applicationContext
    }
  }

  fun prepare(context: Context?, sampleRate: Int) {
    val ctx = (context ?: appContext)?.applicationContext
      ?: throw IllegalStateException("No Android context for PCM playback")
    appContext = ctx

    synchronized(lock) {
      stopLocked(keepRouteMonitor = true)

      val rate = if (sampleRate > 0) sampleRate else 24000
      val minBuf = AudioTrack.getMinBufferSize(
        rate,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
      if (minBuf <= 0) {
        throw IllegalStateException("Invalid AudioTrack buffer for $rate Hz")
      }
      val buf = max(minBuf, rate * 2 / 5) // ~200 ms of 16-bit mono

      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(rate)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()

      val t = AudioTrack.Builder()
        .setAudioAttributes(attrs)
        .setAudioFormat(format)
        .setBufferSizeInBytes(buf)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()

      t.play()
      track = t
      running.set(true)
      writer = Thread({ drain() }, "ExpoPcmPlayerWriter").also { it.start() }

      applyVoiceMode(ctx, preferredRoute)
      beginRouteMonitoring()
    }
  }

  fun playPcm(base64: String) {
    if (!running.get()) return
    val bytes = try {
      Base64.decode(base64, Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      return
    }
    if (bytes.isEmpty()) return
    if (!queue.offer(bytes)) {
      queue.poll()
      queue.offer(bytes)
    }
  }

  fun setRoute(route: String) {
    val normalized = if (route.uppercase() == "SPEAKER") "SPEAKER" else "HEADSET"
    preferredRoute = normalized
    val ctx = appContext ?: return
    applyVoiceMode(ctx, normalized)
  }

  fun clearPlayback() {
    synchronized(lock) {
      queue.clear()
      val t = track ?: return
      try {
        t.pause()
        t.flush()
        if (running.get()) t.play()
      } catch (_: Exception) {
      }
    }
  }

  fun stop() {
    synchronized(lock) {
      stopLocked(keepRouteMonitor = false)
    }
  }

  fun beginRouteMonitoring() {
    val ctx = appContext ?: return
    if (routeReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        onRouteChange?.invoke(routeInfo())
      }
    }
    val filter = IntentFilter().apply {
      addAction(AudioManager.ACTION_HEADSET_PLUG)
      addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
      addAction(Intent.ACTION_HEADSET_PLUG)
    }
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filter)
      }
      routeReceiver = receiver
    } catch (_: Exception) {
    }
  }

  fun endRouteMonitoring() {
    val ctx = appContext ?: return
    val receiver = routeReceiver ?: return
    try {
      ctx.unregisterReceiver(receiver)
    } catch (_: Exception) {
    }
    routeReceiver = null
  }

  fun routeInfo(): Map<String, Any> {
    val ctx = appContext
    if (ctx == null) {
      return mapOf(
        "bluetoothConnected" to false,
        "wiredHeadset" to false,
        "hasExternalAudio" to false,
        "outputName" to "",
        "outputType" to "",
        "preferredRoute" to preferredRoute,
      )
    }
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var bluetooth = false
    var wired = false
    var outputName = ""
    var outputType = ""
    try {
      val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      for (d in devices) {
        when (d.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> {
            bluetooth = true
            if (outputName.isEmpty()) {
              outputName = d.productName?.toString() ?: "Bluetooth"
              outputType = "bluetooth"
            }
          }
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> {
            wired = true
            if (outputName.isEmpty()) {
              outputName = d.productName?.toString() ?: "Headset"
              outputType = "wired"
            }
          }
        }
        if (Build.VERSION.SDK_INT >= 26 && d.type == AudioDeviceInfo.TYPE_USB_HEADSET) {
          wired = true
          if (outputName.isEmpty()) {
            outputName = d.productName?.toString() ?: "USB headset"
            outputType = "wired"
          }
        }
        if (Build.VERSION.SDK_INT >= 31 && d.type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
          bluetooth = true
          if (outputName.isEmpty()) {
            outputName = d.productName?.toString() ?: "Bluetooth"
            outputType = "bluetooth"
          }
        }
      }
    } catch (_: SecurityException) {
      @Suppress("DEPRECATION")
      bluetooth = am.isBluetoothScoOn || am.isBluetoothA2dpOn
      @Suppress("DEPRECATION")
      wired = am.isWiredHeadsetOn
    }
    return mapOf(
      "bluetoothConnected" to bluetooth,
      "wiredHeadset" to wired,
      "hasExternalAudio" to (bluetooth || wired),
      "outputName" to outputName,
      "outputType" to outputType,
      "preferredRoute" to preferredRoute,
    )
  }

  private fun drain() {
    while (running.get()) {
      val chunk = try {
        queue.poll(50, TimeUnit.MILLISECONDS)
      } catch (_: InterruptedException) {
        break
      } ?: continue
      val t = track ?: break
      var offset = 0
      while (offset < chunk.size && running.get()) {
        val written = t.write(chunk, offset, chunk.size - offset)
        if (written <= 0) break
        offset += written
      }
    }
  }

  private fun applyVoiceMode(ctx: Context, route: String) {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    try {
      am.mode = AudioManager.MODE_IN_COMMUNICATION
      val speaker = route.uppercase() == "SPEAKER"
      am.isSpeakerphoneOn = speaker
      if (!speaker) {
        val info = routeInfo()
        if (info["bluetoothConnected"] == true) {
          try {
            am.startBluetoothSco()
            am.isBluetoothScoOn = true
          } catch (_: Exception) {
          }
        }
      } else {
        try {
          am.stopBluetoothSco()
          am.isBluetoothScoOn = false
        } catch (_: Exception) {
        }
      }
    } catch (_: Exception) {
    }
  }

  private fun restoreAudioMode() {
    val ctx = appContext ?: return
    try {
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.isSpeakerphoneOn = false
      try {
        am.stopBluetoothSco()
        am.isBluetoothScoOn = false
      } catch (_: Exception) {
      }
      am.mode = AudioManager.MODE_NORMAL
    } catch (_: Exception) {
    }
  }

  private fun stopLocked(keepRouteMonitor: Boolean) {
    running.set(false)
    queue.clear()
    writer?.interrupt()
    writer = null
    try {
      track?.pause()
      track?.flush()
      track?.stop()
    } catch (_: Exception) {
    }
    try {
      track?.release()
    } catch (_: Exception) {
    }
    track = null
    if (!keepRouteMonitor) {
      endRouteMonitoring()
      restoreAudioMode()
    }
  }
}
