const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
require('dotenv').config();

const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// Konfigurasi
// ==============================
const PORT = Number(process.env.PORT || 3000);
const YOLO_SERVICE_URL = (process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const DELAY_OFF = Number(process.env.DELAY_OFF || 7);

const AUTO_CHECK_ENABLED = String(process.env.AUTO_CHECK_ENABLED || '0').trim() === '1';
const AUTO_CHECK_INTERVAL_SECONDS = Number(process.env.AUTO_CHECK_INTERVAL_SECONDS || 60);

const WORK_HOURS_START = Number(process.env.WORK_HOURS_START || 8);
const WORK_HOURS_END = Number(process.env.WORK_HOURS_END || 17);

// ==============================
// State (logika energi di backend)
// ==============================
let listrik_status = 'ON';
let last_seen_time = Date.now();
let latest_status = null;
let autoCheckInFlight = false;

// Status perangkat (dummy IoT) — bisa diubah lewat API /devices.
let deviceState = {
  lampu: String(process.env.DEFAULT_LAMPU || 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON',
  ac: String(process.env.DEFAULT_AC || 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON',
  dispenser: String(process.env.DEFAULT_DISPENSER || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
};

// ==============================
// Static file untuk gambar captures
// ==============================
const capturesDir = path.join(__dirname, 'captures');
if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });
app.use('/captures', express.static(capturesDir));

// ==============================
// Upload handler (multipart/form-data)
// ==============================
const upload = multer({ storage: multer.memoryStorage() });

// ==============================
// Helpers
// ==============================
function isWorkingHours() {
  const hour = new Date().getHours();
  return hour >= WORK_HOURS_START && hour < WORK_HOURS_END;
}

function anyDeviceOn(devices) {
  return Object.values(devices || {}).some((v) => String(v).toUpperCase() === 'ON');
}

function normalizeDeviceState(devices) {
  const d = devices || {};
  return {
    lampu: String(d.lampu || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    ac: String(d.ac || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    dispenser: String(d.dispenser || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
  };
}

async function readDeviceStateFromDb() {
  const [rows] = await db.execute('SELECT lampu, ac, dispenser FROM device_state WHERE id = 1 LIMIT 1');
  const row = rows?.[0];
  if (!row) return null;
  return normalizeDeviceState({ lampu: row.lampu, ac: row.ac, dispenser: row.dispenser });
}

async function writeDeviceStateToDb(next) {
  const normalized = normalizeDeviceState(next);
  await db.execute(
    `INSERT INTO device_state (id, lampu, ac, dispenser)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lampu = VALUES(lampu), ac = VALUES(ac), dispenser = VALUES(dispenser)`
    , [normalized.lampu, normalized.ac, normalized.dispenser]
  );
  return normalized;
}

async function getDeviceStatePreferDb() {
  try {
    const d = await readDeviceStateFromDb();
    if (d) {
      deviceState = d;
      return d;
    }
  } catch (_) {
    // ignore when DB/table not ready
  }
  return deviceState;
}

// Best-effort hydrate in-memory state from DB (if table exists)
(async () => {
  try {
    const d = await readDeviceStateFromDb();
    if (d) deviceState = d;
  } catch (_) {
    // ignore
  }
})();

function buildNotifikasi({ kondisi, jam_kerja, person_count, devices }) {
  const active = Object.entries(devices)
    .filter(([, v]) => v === 'ON')
    .map(([k]) => k);
  const activeLabel = active.map((x) => x.toUpperCase()).join(', ');

  if (kondisi === 'PEMBOROSAN') {
    return `⚠️ Pemborosan energi terdeteksi: ${activeLabel || 'perangkat'} masih aktif tanpa orang`;
  }
  if (kondisi === 'PERINGATAN') {
    return `🚨 Listrik aktif ${jam_kerja ? '' : 'di luar jam kerja '}tanpa aktivitas: ${activeLabel || 'perangkat'} masih aktif`;
  }
  if (kondisi === 'AMAN') {
    if (person_count === 0) return '✅ Kondisi aman: tidak ada aktivitas, semua perangkat mati';
    return '✅ Kondisi aman';
  }
  return '✅ Aktivitas normal';
}

function computeKondisi({ jam_kerja, person_count, status_listrik_value }) {
  if (jam_kerja) {
    if (person_count > 0 && status_listrik_value === 'ON') return 'NORMAL';
    if (person_count === 0 && status_listrik_value === 'ON') return 'PEMBOROSAN';
    return 'AMAN';
  }
  return status_listrik_value === 'ON' ? 'PERINGATAN' : 'AMAN';
}

function buildStatusPayload(person_count, devices, gambar = '') {
  const jam_kerja = isWorkingHours();
  const waktu_status = jam_kerja ? 'JAM KERJA' : 'LUAR JAM KERJA';

  const normalizedDevices = normalizeDeviceState(devices);
  const status_listrik_value = anyDeviceOn(normalizedDevices) ? 'ON' : 'OFF';
  const status_ruangan = person_count > 0 ? 'ADA ORANG' : 'KOSONG';
  const rekomendasi = status_listrik_value === 'ON' ? 'Listrik menyala' : 'Listrik dimatikan';

  const kondisi = computeKondisi({ jam_kerja, person_count, status_listrik_value });
  const notifikasi = buildNotifikasi({ kondisi, jam_kerja, person_count, devices: normalizedDevices });

  const waktu = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const formatted = `${waktu.getFullYear()}-${pad(waktu.getMonth() + 1)}-${pad(waktu.getDate())} ${pad(waktu.getHours())}:${pad(waktu.getMinutes())}:${pad(waktu.getSeconds())}`;

  return {
    id: null,
    waktu: formatted,
    jumlah_orang: Number(person_count),
    status_listrik: status_listrik_value,
    status_ruangan,
    kondisi,
    notifikasi,
    gambar,
    lampu: normalizedDevices.lampu,
    ac: normalizedDevices.ac,
    dispenser: normalizedDevices.dispenser,
    rekomendasi,
    waktu_status,
  };
}

async function yoloDetectFromBuffer(buffer, { filename = 'image.jpg', mimetype = 'image/jpeg' } = {}) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || 'application/octet-stream' });
  form.append('file', blob, filename);
  return fetchJson(`${YOLO_SERVICE_URL}/detect`, { method: 'POST', body: form });
}

async function yoloSnapshotBuffer() {
  const res = await fetch(`${YOLO_SERVICE_URL}/snapshot`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${YOLO_SERVICE_URL}/snapshot: ${text}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function saveCapture(buffer) {
  const ts = Math.floor(Date.now() / 1000);
  const filename = `${ts}.jpg`;
  fs.writeFileSync(path.join(capturesDir, filename), buffer);
  return `captures/${filename}`;
}

async function saveToDb(payload) {
  try {
    // Prefer the existing single-table setup: monitoring
    const sql = `
      INSERT INTO monitoring
        (waktu, jumlah_orang, status_listrik, status_ruangan, kondisi, notifikasi, gambar, lampu, ac, dispenser)
      VALUES
        (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      payload.jumlah_orang,
      payload.status_listrik,
      payload.status_ruangan,
      payload.kondisi,
      payload.notifikasi || '',
      payload.gambar || '',
      payload.lampu || 'OFF',
      payload.ac || 'OFF',
      payload.dispenser || 'OFF',
    ];
    const [result] = await db.execute(sql, values);
    return result?.insertId ?? null;
  } catch (e) {
    // Fallback: monitoring table exists but may not yet have IoT columns.
    try {
      const sqlLegacy = `
        INSERT INTO monitoring
          (waktu, jumlah_orang, status_listrik, status_ruangan, kondisi, notifikasi, gambar)
        VALUES
          (NOW(), ?, ?, ?, ?, ?, ?)
      `;
      const valuesLegacy = [
        payload.jumlah_orang,
        payload.status_listrik,
        payload.status_ruangan,
        payload.kondisi,
        payload.notifikasi,
        payload.gambar || '',
      ];
      const [result] = await db.execute(sqlLegacy, valuesLegacy);
      return result?.insertId ?? null;
    } catch (e2) {
      console.warn('⚠️ DB insert gagal:', e2?.message || e2);
      return null;
    }
  }
}

function normalizeKondisi(kondisi) {
  return String(kondisi || '').trim().toUpperCase();
}

function notificationLevelForKondisi(kondisi) {
  const k = normalizeKondisi(kondisi);
  if (k === 'PEMBOROSAN') return 'danger';
  if (k === 'PERINGATAN') return 'warning';
  return 'info';
}

async function insertNotification({ kondisi, message, monitoringId = null } = {}) {
  if (!message) return;
  const k = normalizeKondisi(kondisi);
  // Only persist alerts by default (professional table, avoid spamming info).
  if (k !== 'PEMBOROSAN' && k !== 'PERINGATAN') return;

  try {
    await db.execute(
      `INSERT INTO notifications (level, kondisi, message, monitoring_id)
       VALUES (?, ?, ?, ?)`
      , [notificationLevelForKondisi(k), k, String(message), monitoringId]
    );
  } catch (_) {
    // ignore when table not ready
  }
}

async function insertDetections(monitoringId, boxes) {
  if (!monitoringId) return;
  if (!Array.isArray(boxes) || boxes.length === 0) return;

  const values = [];
  for (const b of boxes) {
    const x1 = Number(b.x1);
    const y1 = Number(b.y1);
    const x2 = Number(b.x2);
    const y2 = Number(b.y2);
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue;
    values.push([
      monitoringId,
      b.class_id ?? null,
      b.class_name ?? null,
      b.confidence ?? b.conf ?? null,
      x1,
      y1,
      x2,
      y2,
      b.track_id ?? null,
    ]);
  }

  if (values.length === 0) return;

  try {
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    await db.execute(
      `INSERT INTO detections
        (monitoring_id, class_id, class_name, confidence, x1, y1, x2, y2, track_id)
       VALUES ${placeholders}`,
      flat
    );
  } catch (_) {
    // ignore when table not ready
  }
}

async function insertDeviceEvents(prevDevices, nextDevices, { source, reason, monitoringId = null } = {}) {
  const prev = normalizeDeviceState(prevDevices);
  const next = normalizeDeviceState(nextDevices);

  const events = [];
  for (const device_name of ['lampu', 'ac', 'dispenser']) {
    if (prev[device_name] !== next[device_name]) {
      events.push([source || 'system', device_name, prev[device_name], next[device_name], reason || null, monitoringId]);
    }
  }

  if (events.length === 0) return;

  try {
    const placeholders = events.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
    const flat = events.flat();
    await db.execute(
      `INSERT INTO device_events (source, device_name, prev_state, next_state, reason, monitoring_id)
       VALUES ${placeholders}`,
      flat
    );
  } catch (_) {
    // ignore when table not ready
  }
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}: ${text}`);
  }
  return res.json();
}

// ==============================
// Routes
// ==============================
app.get('/', (_req, res) => {
  res.send('Backend Hematrik jalan 🚀');
});

app.get('/rooms', async (_req, res) => {
  try {
    const [rows] = await db.execute('SELECT name, description FROM rooms ORDER BY id DESC LIMIT 1');
    res.json(rows[0] || { name: 'Ruang Belum Diatur', description: 'Silakan atur di database' });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Auth Routes
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1', [username, password]);
    const user = rows[0];
    if (user) {
      res.json({ 
        success: true, 
        message: 'Login berhasil', 
        user: { id: user.id, username: user.username, role: user.role },
        token: `mock-token-${user.id}-${Date.now()}` 
      });
    } else {
      res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logout berhasil' });
});

app.get('/health', async (_req, res) => {
  try {
    const yolo = await fetchJson(`${YOLO_SERVICE_URL}/health`, { method: 'GET' });
    res.json({ ok: true, yolo });
  } catch (e) {
    res.status(503).json({ ok: false, error: String(e?.message || e) });
  }
});

// Proxy detection enabled ke YOLO service
app.get('/detection/enabled', async (_req, res) => {
  try {
    const data = await fetchJson(`${YOLO_SERVICE_URL}/detection/enabled`, { method: 'GET' });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.post('/detection/enabled', async (req, res) => {
  try {
    const data = await fetchJson(`${YOLO_SERVICE_URL}/detection/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: Boolean(req.body?.enabled) }),
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// Endpoint utama untuk frontend: upload gambar -> YOLO -> simpan DB -> return payload
async function runCheck({ fileBuffer, originalname, mimetype } = {}) {
  // Prefer DB-persisted device state if available.
  let devices = await getDeviceStatePreferDb();
  const prevDevices = normalizeDeviceState(devices);

  // 1) Ambil dari AI
  let imageBuffer = fileBuffer;
  let imageName = originalname || 'image.jpg';
  let imageMime = mimetype || 'image/jpeg';

  if (!imageBuffer) {
    imageBuffer = await yoloSnapshotBuffer();
    imageName = 'snapshot.jpg';
    imageMime = 'image/jpeg';
  }

  const yoloResult = await yoloDetectFromBuffer(imageBuffer, {
    filename: imageName,
    mimetype: imageMime,
  });

  if (!yoloResult?.success) {
    throw new Error(yoloResult?.error || 'YOLO error');
  }

  const person_count = Number(yoloResult.jumlah_orang || 0);
  const boxes = Array.isArray(yoloResult.boxes) ? yoloResult.boxes : [];

  // 2) Logika listrik + perangkat (dummy IoT)
  const now = Date.now();
  let autoOffTriggered = false;
  if (person_count > 0) {
    last_seen_time = now;
    listrik_status = 'ON';
  } else {
    const seconds = (now - last_seen_time) / 1000;
    if (seconds > DELAY_OFF) {
      listrik_status = 'OFF';
      // Simulasikan auto-mati perangkat ketika ruangan kosong lama
      devices = { lampu: 'OFF', ac: 'OFF', dispenser: 'OFF' };
      autoOffTriggered = true;
    }
  }
  // Jika listrik OFF, paksa semua perangkat OFF
  if (listrik_status === 'OFF') {
    devices = { lampu: 'OFF', ac: 'OFF', dispenser: 'OFF' };
  }

  devices = normalizeDeviceState(devices);
  deviceState = devices;
  // Best-effort persist (non-fatal if DB/table not ready)
  try {
    await writeDeviceStateToDb(devices);
  } catch (_) {
    // ignore
  }

  // 3) Simpan capture untuk histori
  const gambar = saveCapture(imageBuffer);

  // 4) Build payload + simpan DB
  const payload = buildStatusPayload(person_count, devices, gambar);
  if (autoOffTriggered) {
    payload.notifikasi = '🔌 Sistem Otomatis: Perangkat listrik telah dimatikan karena ruangan kosong.';
  }
  latest_status = { ...payload, boxes, success: true };
  const monitoringId = await saveToDb(payload);
  // Best-effort: persist richer audit/analytics tables if available.
  await Promise.all([
    insertDetections(monitoringId, boxes),
    insertNotification({ kondisi: payload.kondisi, message: payload.notifikasi, monitoringId }),
    insertDeviceEvents(prevDevices, devices, {
      source: autoOffTriggered ? 'auto' : 'system',
      reason: autoOffTriggered ? 'auto-off: ruangan kosong melebihi DELAY_OFF' : null,
      monitoringId,
    }),
  ]);

  // 5) Response ke frontend
  return {
    success: true,
    waktu: payload.waktu,
    jumlah_orang: payload.jumlah_orang,
    kondisi: payload.kondisi,
    status_listrik: payload.status_listrik,
    notifikasi: payload.notifikasi,
    gambar: payload.gambar,
    lampu: payload.lampu,
    ac: payload.ac,
    dispenser: payload.dispenser,
    boxes,
  };
}

// Spec endpoint: /check → proses utama (AI + logika)
app.post('/check', upload.single('file'), async (req, res) => {
  try {
    const out = await runCheck({
      fileBuffer: req.file?.buffer,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
    });
    res.json(out);
  } catch (e) {
    console.error('ERROR /check:', e);
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

// Backward-compatible alias
app.post('/detect', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: 'file wajib dikirim (field: file) atau gunakan /check tanpa file (snapshot)' });
    }
    const out = await runCheck({
      fileBuffer: req.file?.buffer,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
    });
    res.json(out);
  } catch (e) {
    console.error('ERROR /detect:', e);
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.get('/status', async (_req, res) => {
  if (latest_status) return res.json(latest_status);

  try {
    const [rows] = await db.execute('SELECT * FROM monitoring ORDER BY id DESC LIMIT 1');
    const row = rows?.[0];
    if (!row) return res.json(buildStatusPayload(0, deviceState));

    // mysql2 mengembalikan object (bukan array) jika tidak pakai rowsAsArray.
    // Kita map defensif sesuai nama kolom umum.
    const payload = {
      id: row.id ?? null,
      waktu: row.waktu ? String(row.waktu) : '',
      jumlah_orang: row.jumlah_orang ?? 0,
      status_listrik: row.status_listrik ?? listrik_status,
      status_ruangan: row.status_ruangan ?? (row.status_listrik === 'ON' ? 'ADA ORANG' : 'KOSONG'),
      kondisi: row.kondisi ?? 'AMAN',
      notifikasi: row.notifikasi ?? 'Normal',
      gambar: row.gambar ?? '',
      lampu: row.lampu ?? null,
      ac: row.ac ?? null,
      dispenser: row.dispenser ?? null,
    };
    res.json(payload);
  } catch (e) {
    console.error('❌ ERROR /status:', e);
    res.json(buildStatusPayload(0, deviceState));
  }
});

async function readHistory(limit = 20) {
  const [rows] = await db.execute('SELECT * FROM monitoring ORDER BY id DESC LIMIT ?', [Number(limit)]);
  return rows || [];
}

async function readNotifications(limit = 10) {
  const lim = Number(limit) || 10;
  // Prefer professional table if it exists.
  try {
    const [rows] = await db.execute(
      `SELECT id, created_at, kondisi, message
       FROM notifications
       ORDER BY id DESC
       LIMIT ?`,
      [lim]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      waktu: String(r.created_at),
      kondisi: r.kondisi,
      notifikasi: r.message,
    }));
  } catch (_) {
    // Fallback to monitoring (legacy)
    const [rows] = await db.execute(
      `SELECT id, waktu, kondisi, notifikasi
       FROM monitoring
       ORDER BY id DESC
       LIMIT ?`,
      [lim]
    );
    return (rows || []).map((r) => ({
      id: r.id,
      waktu: String(r.waktu),
      kondisi: r.kondisi,
      notifikasi: r.notifikasi,
    }));
  }
}

// Spec endpoint: /history → ambil data dari DB
app.get('/history', async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 20);
    const rows = await readHistory(limit);
    const data = (rows || []).map((row) => ({
      id: row.id ?? 0,
      waktu: row.waktu ? String(row.waktu) : '',
      jumlah_orang: row.jumlah_orang ?? 0,
      kondisi: row.kondisi ?? 'AMAN',
      status_listrik: row.status_listrik ?? '',
      notifikasi: row.notifikasi ?? '',
      gambar: row.gambar ?? '',
      lampu: row.lampu ?? '',
      ac: row.ac ?? '',
      dispenser: row.dispenser ?? '',
    }));
    res.json(data);
  } catch (e) {
    console.error('❌ ERROR /history:', e);
    if (latest_status) return res.json([latest_status]);
    res.json([]);
  }
});

// Backward-compatible alias
app.get('/data', async (req, res) => {
  try {
    const limit = Number(req.query?.limit || 20);
    const rows = await readHistory(limit);
    const data = (rows || []).map((row) => ({
      id: row.id ?? 0,
      waktu: row.waktu ? String(row.waktu) : '',
      jumlah_orang: row.jumlah_orang ?? 0,
      kondisi: row.kondisi ?? 'AMAN',
      status_listrik: row.status_listrik ?? '',
      notifikasi: row.notifikasi ?? '',
      gambar: row.gambar ?? '',
    }));
    res.json(data);
  } catch (e) {
    console.error('❌ ERROR /data:', e);
    // Fallback: kalau DB mati, setidaknya balikin status terakhir bila ada.
    if (latest_status) return res.json([latest_status]);
    res.json([]);
  }
});

// Spec endpoint: /summary → ringkasan data
app.get('/summary', async (req, res) => {
  try {
    const hours = Number(req.query?.hours || 24);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [rows] = await db.execute(
      `SELECT kondisi, status_listrik, COUNT(*) as total, AVG(jumlah_orang) as avg_orang
       FROM monitoring
       WHERE waktu >= ?
       GROUP BY kondisi, status_listrik
       ORDER BY total DESC`,
      [cutoff]
    );

    // Ringkasan bulan berjalan (untuk kartu di dashboard)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const [monthlyRows] = await db.execute(
      `SELECT kondisi, COUNT(*) as total
       FROM monitoring
       WHERE waktu >= ?
       GROUP BY kondisi`,
      [monthStart]
    );

    const monthlyMap = Object.fromEntries((monthlyRows || []).map((r) => [String(r.kondisi), Number(r.total || 0)]));
    const totalPengecekan = Object.values(monthlyMap).reduce((a, b) => a + b, 0);

    res.json({
      window_hours: hours,
      generated_at: new Date().toISOString(),
      breakdown: (rows || []).map((r) => ({
        kondisi: r.kondisi,
        status_listrik: r.status_listrik,
        total: Number(r.total || 0),
        avg_orang: Number(r.avg_orang || 0),
      })),
      monthly: {
        pemborosan: monthlyMap.PEMBOROSAN || 0,
        normal: monthlyMap.NORMAL || 0,
        peringatan: monthlyMap.PERINGATAN || 0,
        aman: monthlyMap.AMAN || 0,
        total_pengecekan: totalPengecekan,
      },
    });
  } catch (e) {
    console.error('❌ ERROR /summary:', e);
    // Fallback non-fatal ketika DB tidak tersedia.
    res.json({
      window_hours: Number(req.query?.hours || 24),
      generated_at: new Date().toISOString(),
      breakdown: [],
      monthly: {
        pemborosan: 0,
        normal: 0,
        peringatan: 0,
        aman: 0,
        total_pengecekan: 0,
      },
      db_error: String(e?.message || e),
    });
  }
});

// Aggregated endpoint for dashboard UI
app.get('/dashboard', async (_req, res) => {
  try {
    const [latestRows] = await db.execute('SELECT * FROM monitoring ORDER BY id DESC LIMIT 1');
    const latest = latestRows?.[0] || null;

    const last7Start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [activityRows] = await db.execute(
      `SELECT DATE(waktu) as tanggal,
              AVG(jumlah_orang) as avg_orang,
              SUM(CASE WHEN kondisi = 'PEMBOROSAN' THEN 1 ELSE 0 END) as pemborosan
       FROM monitoring
       WHERE waktu >= ?
       GROUP BY DATE(waktu)
       ORDER BY DATE(waktu) ASC`,
      [last7Start]
    );

    const notifications = await readNotifications(10);

    const [historyRows] = await db.execute('SELECT * FROM monitoring ORDER BY id DESC LIMIT 10');

    res.json({
      latest: latest
        ? {
            id: latest.id,
            waktu: String(latest.waktu),
            jumlah_orang: latest.jumlah_orang,
            status_listrik: latest.status_listrik,
            status_ruangan: latest.status_ruangan,
            lampu: latest.lampu,
            ac: latest.ac,
            dispenser: latest.dispenser,
            kondisi: latest.kondisi,
            notifikasi: latest.notifikasi,
            gambar: latest.gambar,
          }
        : null,
      activity_7d: (activityRows || []).map((r) => ({
        tanggal: String(r.tanggal),
        avg_orang: Number(r.avg_orang || 0),
        pemborosan: Number(r.pemborosan || 0),
      })),
      notifications,
      recent_checks: (historyRows || []).map((r) => ({
        id: r.id,
        waktu: String(r.waktu),
        jumlah_orang: r.jumlah_orang,
        lampu: r.lampu,
        ac: r.ac,
        dispenser: r.dispenser,
        kondisi: r.kondisi,
        notifikasi: r.notifikasi,
        gambar: r.gambar,
      })),
    });
  } catch (e) {
    console.error('❌ ERROR /dashboard:', e);
    // Fallback non-fatal ketika DB tidak tersedia.
    res.json({
      latest: latest_status ?? null,
      activity_7d: [],
      notifications: latest_status?.notifikasi
        ? [
            {
              id: latest_status?.id ?? 0,
              waktu: latest_status?.waktu ?? '',
              kondisi: latest_status?.kondisi ?? 'AMAN',
              notifikasi: latest_status?.notifikasi ?? '',
            },
          ]
        : [],
      recent_checks: latest_status ? [latest_status] : [],
      db_error: String(e?.message || e),
    });
  }
});

// Device status endpoints (dummy IoT)
app.get('/devices', (_req, res) => {
  getDeviceStatePreferDb()
    .then((d) => res.json({ ...d, status_listrik: anyDeviceOn(d) ? 'ON' : 'OFF' }))
    .catch(() => res.json({ ...deviceState, status_listrik: anyDeviceOn(deviceState) ? 'ON' : 'OFF' }));
});

app.post('/devices', (req, res) => {
  const prev = normalizeDeviceState(deviceState);
  const next = normalizeDeviceState({
    lampu: req.body?.lampu ?? deviceState.lampu,
    ac: req.body?.ac ?? deviceState.ac,
    dispenser: req.body?.dispenser ?? deviceState.dispenser,
  });

  writeDeviceStateToDb(next)
    .then((saved) => {
      deviceState = saved;
      listrik_status = anyDeviceOn(saved) ? 'ON' : 'OFF';
      insertDeviceEvents(prev, saved, { source: 'manual', reason: 'manual toggle' }).catch(() => {});
      res.json({ ...saved, status_listrik: listrik_status });
    })
    .catch(() => {
      deviceState = next;
      listrik_status = anyDeviceOn(next) ? 'ON' : 'OFF';
      insertDeviceEvents(prev, next, { source: 'manual', reason: 'manual toggle' }).catch(() => {});
      res.json({ ...next, status_listrik: listrik_status, db_warning: 'device_state not persisted' });
    });
});

app.get('/listrik/on', (_req, res) => {
  listrik_status = 'ON';
  res.json({ status: 'Listrik dinyalakan' });
});

app.get('/listrik/off', (_req, res) => {
  listrik_status = 'OFF';
  res.json({ status: 'Listrik dimatikan' });
});

// Proxy stream dari YOLO service (MJPEG)
app.get('/stream', async (req, res) => {
  const controller = new AbortController();
  try {
    // If client disconnects, abort upstream fetch so YOLO can stop reading camera.
    res.on('close', () => {
      try { controller.abort(); } catch (_) {}
    });

    const raw = req.query?.auto_stop_no_people_seconds;
    const parsed = raw !== undefined ? Number(raw) : NaN;
    const seconds = Number.isFinite(parsed) ? parsed : DELAY_OFF;

    const url = new URL(`${YOLO_SERVICE_URL}/stream`);
    if (Number.isFinite(seconds) && seconds > 0) {
      url.searchParams.set('auto_stop_no_people_seconds', String(seconds));
    }

    const upstream = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).send(text || 'Upstream stream error');
    }

    res.status(200);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-cache');

    // Node's fetch() returns a WHATWG ReadableStream; convert to Node stream for Express.
    const body = upstream.body;
    const nodeStream = typeof body.pipe === 'function' ? body : Readable.fromWeb(body);

    nodeStream.on('error', (err) => {
      console.error('Stream upstream error:', err);
      try { res.end(); } catch (_) {}
    });
    res.on('close', () => {
      try { nodeStream.destroy(); } catch (_) {}
      try { controller.abort(); } catch (_) {}
    });

    nodeStream.pipe(res);
  } catch (e) {
    const msg = String(e?.message || e);
    // Aborted when client disconnects; don't treat as server error.
    if (msg.toLowerCase().includes('abort')) {
      try { res.end(); } catch (_) {}
      return;
    }
    console.error('ERROR /stream:', e);
    res.status(500).send('Stream error');
  }
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log(`YOLO service: ${YOLO_SERVICE_URL}`);
});

// Sistem otomatis (interval)
if (AUTO_CHECK_ENABLED) {
  const ms = Math.max(5, AUTO_CHECK_INTERVAL_SECONDS) * 1000;
  console.log(`Auto-check aktif: tiap ${Math.round(ms / 1000)} detik`);

  setInterval(async () => {
    if (autoCheckInFlight) return;
    autoCheckInFlight = true;
    try {
      await runCheck();
    } catch (e) {
      console.warn('⚠️ Auto-check gagal:', e?.message || e);
    } finally {
      autoCheckInFlight = false;
    }
  }, ms);
}