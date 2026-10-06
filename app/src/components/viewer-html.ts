// Página que corre dentro del WebView y muestra el stream MJPEG.
//
// Por qué no un simple <img src=".../stream">: esa etiqueta no avisa cuándo llega
// cada fotograma, así que no sabríamos si el video se congeló. Aquí leemos el
// stream con fetch() y lo partimos en JPEGs buscando sus marcadores de inicio
// (FF D8) y fin (FF D9). Así controlamos cada fotograma y se lo reportamos a React Native.
//
// Mensajes hacia React Native:
//   { type: 'frame', fps, dropped }  al primer fotograma y luego cada segundo
//   { type: 'error', message }       si falla la conexión o se cierra el stream

export type ViewerMessage =
  | { type: 'frame'; fps: number; dropped: number }
  | { type: 'error'; message: string };

export function buildViewerHtml(streamUrl: string) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
<img id="video" alt="">
<script>
(function () {
  var STREAM_URL = ${JSON.stringify(streamUrl)};
  var MAX_BUFFER = 512 * 1024; // si se acumula más sin encontrar un JPEG, algo anda mal: se descarta

  function send(msg) {
    var text = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent !== window) window.parent.postMessage(text, '*');
  }

  var img = document.getElementById('video');
  var decoding = false;
  var frames = 0, dropped = 0, lastReport = 0, firstFrame = true;

  // Solo se decodifica un fotograma a la vez. Si llega otro mientras el anterior
  // se está pintando, se descarta: preferimos el más reciente a acumular retraso.
  function show(jpeg) {
    if (decoding) { dropped++; return; }
    decoding = true;
    var url = URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
    var previous = img.src;
    img.onload = function () {
      decoding = false;
      if (previous.indexOf('blob:') === 0) URL.revokeObjectURL(previous); // liberar memoria
    };
    img.onerror = function () { decoding = false; URL.revokeObjectURL(url); };
    img.src = url;

    frames++;
    var now = Date.now();
    if (firstFrame || now - lastReport >= 1000) {
      // En el primer fotograma todavía no hay con qué medir: fps = 0 significa "midiendo".
      var fps = firstFrame ? 0 : Math.round(frames * 1000 / (now - lastReport));
      send({ type: 'frame', fps: fps, dropped: dropped });
      firstFrame = false;
      frames = 0; dropped = 0; lastReport = now;
    }
  }

  function indexOfMarker(bytes, second, from) {
    for (var i = from; i < bytes.length - 1; i++) {
      if (bytes[i] === 0xFF && bytes[i + 1] === second) return i;
    }
    return -1;
  }

  var buffer = new Uint8Array(0);

  function append(chunk) {
    var merged = new Uint8Array(buffer.length + chunk.length);
    merged.set(buffer);
    merged.set(chunk, buffer.length);
    buffer = merged;
  }

  function extractFrames() {
    while (true) {
      var start = indexOfMarker(buffer, 0xD8, 0);
      if (start < 0) { buffer = buffer.slice(Math.max(0, buffer.length - 1)); return; }
      var end = indexOfMarker(buffer, 0xD9, start + 2);
      if (end < 0) {
        buffer = buffer.slice(start);
        if (buffer.length > MAX_BUFFER) buffer = new Uint8Array(0);
        return;
      }
      show(buffer.slice(start, end + 2));
      buffer = buffer.slice(end + 2);
    }
  }

  fetch(STREAM_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      var reader = res.body.getReader();
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) { send({ type: 'error', message: 'La ESP32 cerró el stream' }); return; }
          append(result.value);
          extractFrames();
          return pump();
        });
      }
      return pump();
    })
    .catch(function (e) {
      send({ type: 'error', message: 'Sin conexión al stream (' + (e && e.message ? e.message : e) + ')' });
    });
})();
</script>
</body>
</html>`;
}
