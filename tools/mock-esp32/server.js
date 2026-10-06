// Simulador de la ESP32-S3 CAM. Expone la misma API que tendrá el firmware real
// (ver docs/API.md) para desarrollar y probar la app sin la placa.
//
//   npm start                      -> puertos 80 (control) y 81 (stream)
//   PORT_HTTP=8080 PORT_STREAM=8081 npm start
//
// Teclas en la terminal (o POST /debug/motion, /debug/cut, /debug/freeze):
//   m  simular movimiento          c  cortar el stream 10 s (como si se cayera el Wi-Fi)
//   f  congelar el stream 10 s     q  salir
const http = require('http');
const os = require('os');
const jpeg = require('jpeg-js');

const PORT_HTTP = Number(process.env.PORT_HTTP || 80);
const PORT_STREAM = Number(process.env.PORT_STREAM || 81);
const FPS = 10;
const WIDTH = 320;
const HEIGHT = 240;
const BOUNDARY = 'frame';
const COOLDOWN_MS = 10000;

// ---------- Fotogramas falsos: un cuadrado que se mueve sobre un fondo ----------
function makeFrame(i) {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4);
  const boxX = Math.round((WIDTH - 60) * (0.5 + 0.5 * Math.sin(i / 10)));
  const boxY = Math.round((HEIGHT - 60) * (0.5 + 0.5 * Math.cos(i / 7)));
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = (y * WIDTH + x) * 4;
      const inBox = x >= boxX && x < boxX + 60 && y >= boxY && y < boxY + 60;
      data[p] = inBox ? 230 : 20 + (x * 40) / WIDTH;
      data[p + 1] = inBox ? 80 : 30 + (y * 60) / HEIGHT;
      data[p + 2] = inBox ? 60 : 60;
      data[p + 3] = 255;
    }
  }
  return jpeg.encode({ data, width: WIDTH, height: HEIGHT }, 70).data;
}
const FRAMES = Array.from({ length: 88 }, (_, i) => makeFrame(i));

// ---------- Estado del "dispositivo" ----------
const device = {
  manualArmed: false,
  state: 'DESARMADO',
  lastMotion: null,
  motionCount: 0,
  detectionMode: 2,
  bootAt: Date.now(),
  slots: [{ id: 'noche', days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '06:00', enabled: true }],
};
let stateTimer = null;

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Una franja puede cruzar la medianoche (22:00 -> 06:00). En ese caso la parte
// de después de medianoche pertenece al día en que empezó la franja.
function inSchedule(now = new Date()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return device.slots.some((slot) => {
    if (!slot.enabled) return false;
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    if (start <= end) return slot.days.includes(day) && minutes >= start && minutes < end;
    const yesterday = (day + 6) % 7;
    return (slot.days.includes(day) && minutes >= start) || (slot.days.includes(yesterday) && minutes < end);
  });
}

function isArmed() {
  return device.manualArmed || inSchedule();
}

function refreshIdleState() {
  if (device.state === 'DETECTANDO' || device.state === 'ALERTA_ENVIADA') return;
  device.state = isArmed() ? 'ARMADO' : 'DESARMADO';
}

function statusJson() {
  refreshIdleState();
  return {
    state: device.state,
    armed: isArmed(),
    manualArmed: device.manualArmed,
    inSchedule: inSchedule(),
    lastMotion: device.lastMotion,
    motionCount: device.motionCount,
    detectionMode: device.detectionMode,
    uptime: Math.floor((Date.now() - device.bootAt) / 1000),
    time: Math.floor(Date.now() / 1000),
    rssi: -55,
  };
}

function simulateMotion() {
  if (!isArmed()) {
    console.log('[movimiento] ignorado: el sistema está desarmado');
    return;
  }
  if (device.state !== 'ARMADO') {
    console.log(`[movimiento] ignorado: estado ${device.state} (cooldown)`);
    return;
  }
  device.state = 'DETECTANDO';
  device.lastMotion = Math.floor(Date.now() / 1000);
  device.motionCount += 1;
  console.log('[movimiento] DETECTANDO -> enviando alertas (simulado)');
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    device.state = 'ALERTA_ENVIADA';
    console.log(`[movimiento] ALERTA_ENVIADA, cooldown ${COOLDOWN_MS / 1000} s`);
    stateTimer = setTimeout(() => {
      device.state = 'DESARMADO';
      refreshIdleState();
      console.log(`[movimiento] fin del cooldown -> ${device.state}`);
    }, COOLDOWN_MS);
  }, 2000);
}

// ---------- Servidor de control (puerto 80) ----------
function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
  });
}

function validSlot(s) {
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  return (
    s && typeof s.id === 'string' && Array.isArray(s.days) &&
    s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    hhmm.test(s.start) && hhmm.test(s.end) && typeof s.enabled === 'boolean'
  );
}

const controlServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  console.log(`[http] ${req.method} ${url.pathname}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/status') return sendJson(res, 200, statusJson());

    if (req.method === 'POST' && url.pathname === '/arm') {
      const body = await readJson(req);
      if (typeof body.armed !== 'boolean') return sendJson(res, 400, { error: 'Falta "armed" (true/false)' });
      device.manualArmed = body.armed;
      refreshIdleState();
      return sendJson(res, 200, statusJson());
    }

    if (req.method === 'GET' && url.pathname === '/schedule') return sendJson(res, 200, { slots: device.slots });

    if (req.method === 'POST' && url.pathname === '/schedule') {
      const body = await readJson(req);
      if (!Array.isArray(body.slots) || body.slots.length > 8 || !body.slots.every(validSlot)) {
        return sendJson(res, 400, { error: 'Franjas inválidas (máximo 8, horas HH:MM, días 0-6)' });
      }
      device.slots = body.slots;
      refreshIdleState();
      return sendJson(res, 200, { slots: device.slots });
    }

    if (req.method === 'GET' && url.pathname === '/capture') {
      const frame = FRAMES[Math.floor(Date.now() / (1000 / FPS)) % FRAMES.length];
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
      return res.end(frame);
    }

    // Solo del simulador: lo mismo que las teclas, para probar sin terminal.
    if (req.method === 'POST' && url.pathname === '/debug/motion') {
      simulateMotion();
      return sendJson(res, 200, statusJson());
    }
    if (req.method === 'POST' && url.pathname === '/debug/cut') {
      cutStream();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/debug/freeze') {
      freezeStream();
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { error: 'No encontrado' });
  } catch (e) {
    sendJson(res, 400, { error: e.message });
  }
});

// ---------- Servidor de stream MJPEG (puerto 81) ----------
let streamDownUntil = 0;
let frozenUntil = 0;
const clients = new Set();

const streamServer = http.createServer((req, res) => {
  if (Date.now() < streamDownUntil) return req.socket.destroy();
  if (req.url !== '/stream') {
    res.writeHead(404);
    return res.end();
  }
  console.log(`[stream] cliente conectado (${clients.size + 1} activos)`);
  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  let i = 0;
  const timer = setInterval(() => {
    if (Date.now() < frozenUntil) return;
    const frame = FRAMES[i++ % FRAMES.length];
    res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
    res.write(frame);
    res.write('\r\n');
  }, 1000 / FPS);
  const client = { res, timer };
  clients.add(client);
  req.on('close', () => {
    clearInterval(timer);
    clients.delete(client);
    console.log(`[stream] cliente desconectado (${clients.size} activos)`);
  });
});

function cutStream() {
  streamDownUntil = Date.now() + 10000;
  for (const c of clients) c.res.socket.destroy();
  console.log('[stream] CORTADO por 10 s');
}

function freezeStream() {
  frozenUntil = Date.now() + 10000;
  console.log('[stream] CONGELADO por 10 s (la conexión sigue abierta, pero sin fotogramas)');
}

// ---------- Arranque ----------
function lanIps() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

controlServer.listen(PORT_HTTP, () => {
  streamServer.listen(PORT_STREAM, () => {
    console.log('Simulador ESP32 listo.');
    for (const ip of lanIps()) {
      console.log(`  Control: http://${ip}:${PORT_HTTP}/status   Stream: http://${ip}:${PORT_STREAM}/stream`);
    }
    console.log('Teclas: m = movimiento, c = cortar stream, f = congelar stream, q = salir');
  });
});

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (key) => {
    const k = key.toString();
    if (k === 'm') simulateMotion();
    else if (k === 'c') cutStream();
    else if (k === 'f') freezeStream();
    else if (k === 'q' || k === '\u0003') process.exit(0);
  });
}
