import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * iOS draws a multipart MJPEG response from its own image buffer, so the
 * picture plays forward and then jumps backward. This page reads the bytes
 * once and shows only the newest complete JPEG.
 */
function liveHtml(streamUrl, headerObj) {
    const src = JSON.stringify(String(streamUrl));
    const hdr = JSON.stringify(headerObj || {});
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%}
img{position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;background:#000}
</style>
</head><body><img id="f" alt="">
<script>
(function(){
  var url = ${src};
  var extra = ${hdr};
  var img = document.getElementById('f');
  var last = '';
  var posted = false;
  var gen = 0;
  var pending = null;
  var painting = false;
  var startedXhr = false;
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  function tell(msg){ try { window.ReactNativeWebView.postMessage(msg); } catch (e) {} }
  function paint(bytes){
    pending = bytes;
    if (painting) return;
    painting = true;
    requestAnimationFrame(function(){
      painting = false;
      var frame = pending;
      pending = null;
      if (!frame) return;
      var token = ++gen;
      var next = URL.createObjectURL(new Blob([frame], {type:'image/jpeg'}));
      img.onload = function(){
        if (token !== gen) { URL.revokeObjectURL(next); return; }
        if (last) URL.revokeObjectURL(last);
        last = next;
        if (!posted) { posted = true; tell('frame'); }
      };
      img.src = next;
    });
  }
  function extract(buf){
    var frame = null;
    var i = 0;
    while (i < buf.length - 1) {
      if (buf[i] !== 0xFF || buf[i+1] !== 0xD8) { i++; continue; }
      var j = i + 2;
      var end = -1;
      while (j < buf.length - 1) {
        if (buf[j] === 0xFF && buf[j+1] === 0xD9) { end = j + 2; break; }
        j++;
      }
      if (end < 0) return { frame: frame, rest: buf.slice(i) };
      frame = buf.slice(i, end);
      i = end;
    }
    return { frame: frame, rest: new Uint8Array(0) };
  }
  function concat(a, b){
    if (!a || !a.length) return b;
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
  function latin1(str){
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
    return out;
  }
  function xhrPump(){
    if (startedXhr) return;
    startedXhr = true;
    if (ctrl) { try { ctrl.abort(); } catch (e) {} }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    if (extra.Authorization) xhr.setRequestHeader('Authorization', extra.Authorization);
    if (extra.Cookie) xhr.setRequestHeader('Cookie', extra.Cookie);
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    var seen = 0;
    var rest = new Uint8Array(0);
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 2 && xhr.status >= 400 && !posted) tell('fail');
    };
    xhr.onprogress = function(){
      var text = xhr.responseText || '';
      if (text.length < seen) { seen = 0; rest = new Uint8Array(0); }
      if (text.length <= seen) return;
      var chunk = latin1(text.slice(seen));
      seen = text.length;
      var parsed = extract(concat(rest, chunk));
      rest = parsed.rest;
      if (parsed.frame) paint(parsed.frame);
    };
    xhr.onerror = function(){ if (!posted) tell('fail'); };
    xhr.send();
  }
  async function fetchPump(){
    var res = await fetch(url, { cache: 'no-store', headers: extra, signal: ctrl ? ctrl.signal : undefined });
    if (!res.ok || !res.body || !res.body.getReader) throw new Error('nostream');
    var reader = res.body.getReader();
    var rest = new Uint8Array(0);
    while (true) {
      var part = await reader.read();
      if (part.done) break;
      var parsed = extract(concat(rest, part.value));
      rest = parsed.rest;
      if (parsed.frame) paint(parsed.frame);
      if (rest.length > 900000) rest = rest.slice(-2);
    }
  }
  fetchPump().catch(function(){ if (!posted) xhrPump(); });
  setTimeout(function(){ if (!posted) xhrPump(); }, 4000);
  setTimeout(function(){ if (!posted) tell('fail'); }, 8000);
})();
</script></body></html>`;
}

function originOf(url) {
    const match = String(url || '').match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1] : '';
}

export default function HaCameraView({
    haUrl,
    entityId,
    accessToken,
    url,
    headers,
    style,
    onFirstFrame,
    onFail,
}) {
    const auth = headers?.Authorization || '';
    const cookie = headers?.Cookie || '';
    const source = useMemo(() => {
        const direct = String(url || '');
        const base = String(haUrl || '').replace(/\/$/, '');
        const id = String(entityId || '');
        const token = String(accessToken || '');
        let stream = direct;
        if (!stream) {
            if (!base || !id.startsWith('camera.') || !token) return null;
            stream = `${base}/api/camera_proxy_stream/${id}?token=${encodeURIComponent(token)}`;
        }
        const headerObj = {};
        if (auth) headerObj.Authorization = auth;
        if (cookie) headerObj.Cookie = cookie;
        return { html: liveHtml(stream, headerObj), baseUrl: originOf(stream) || base || undefined };
    }, [url, haUrl, entityId, accessToken, auth, cookie]);

    if (!source) return null;

    return (
        <WebView
            source={source}
            style={style || StyleSheet.absoluteFill}
            scrollEnabled={false}
            bounces={false}
            pointerEvents="none"
            originWhitelist={['*']}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            scalesPageToFit={false}
            cacheEnabled={false}
            onMessage={(event) => {
                const data = event?.nativeEvent?.data;
                if (data === 'frame') onFirstFrame?.();
                else if (data === 'fail') onFail?.();
            }}
        />
    );
}
