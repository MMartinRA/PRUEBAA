/**
 * TOF Sistema - Backend (API REST + Base de Datos pura)
 * Express + SQLite + JWT + Excel/PDF export
 * El procesamiento, MQTT y alertas (Emails) ahora son orquestados por Node-RED.
 */

const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const mqtt       = require('mqtt');
const Database   = require('better-sqlite3');
const ExcelJS    = require('exceljs');
const PDFDocument= require('pdfkit');
const path       = require('path');

const app  = express();
const PORT = 3001;
const JWT_SECRET = 'tof_caece_secret_2025';

app.use(cors());
app.use(express.json());

// ================================================================
// BASE DE DATOS SQLite
// ================================================================
const db = new Database(path.join(__dirname, 'tof.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin','usuario'))
  );

  CREATE TABLE IF NOT EXISTS lecturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now','localtime')),
    distancia_mm INTEGER NOT NULL,
    alerta INTEGER NOT NULL DEFAULT 0,
    sensor_id TEXT DEFAULT 'SENSOR-01'
  );

  CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS heatmap (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now','localtime')),
    zona TEXT NOT NULL,
    conteo INTEGER DEFAULT 1
  );
`);

const configDefaults = {
  umbral_mm:         '200',
  tiempo_muestreo_s: '1',
  cantidad_sensores: '1',
  email_alertas:     'admin@ejemplo.com',
  sistema_activo:    'true',
  sistema_id:        'SENSOR-01'
};
const insertConfig = db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(configDefaults)) insertConfig.run(k, v);

const insertUsuario = db.prepare('INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES (?, ?, ?)');
insertUsuario.run('admin',  bcrypt.hashSync('admin123', 10),  'admin');
insertUsuario.run('usuario', bcrypt.hashSync('user123', 10), 'usuario');

// ================================================================
// MQTT (Solo para publicar comandos hacia el ESP32)
// ================================================================
const mqttClient = mqtt.connect('mqtt://test.mosquitto.org:1883', {
  clientId: 'backend-tof-caece-pub'
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado (Modo solo publicación de comandos)');
});

function distanciaAZona(mm) {
  if (mm <= 100) return '0-100mm';
  if (mm <= 200) return '100-200mm';
  if (mm <= 300) return '200-300mm';
  if (mm <= 400) return '300-400mm';
  return '>400mm';
}

function getConfig() {
  const rows = db.prepare('SELECT clave, valor FROM config').all();
  const cfg = {};
  for (const r of rows) cfg[r.clave] = r.valor;
  cfg.sistema_activo = cfg.sistema_activo === 'true';
  return cfg;
}

// ================================================================
// MIDDLEWARE JWT
// ================================================================
function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Sin token' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function soloAdmin(req, res, next) {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido' });
  }
  next();
}

// ================================================================
// RUTAS: INGESTA DE DATOS DESDE NODE-RED
// ================================================================
app.post('/api/ingesta', (req, res) => {
  const { distancia_mm, alerta, sensor_id } = req.body;
  if (distancia_mm === undefined) return res.status(400).json({ error: 'Faltan datos' });

  // 1. Guardar en SQLite
  db.prepare(
    'INSERT INTO lecturas (distancia_mm, alerta, sensor_id) VALUES (?, ?, ?)'
  ).run(distancia_mm, alerta, sensor_id || 'SENSOR-01');

  // 2. Actualizar heatmap
  const zona = distanciaAZona(distancia_mm);
  const hoy = new Date().toISOString().slice(0, 10);
  const existing = db.prepare("SELECT id FROM heatmap WHERE zona = ? AND date(timestamp) = ?").get(zona, hoy);
  
  if (existing) {
    db.prepare("UPDATE heatmap SET conteo = conteo + 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare("INSERT INTO heatmap (zona, conteo) VALUES (?, 1)").run(zona);
  }

  res.json({ ok: true });
});

// Ruta interna para que Node-RED consulte la configuración inicial
app.get('/api/config/interna', (req, res) => {
  res.json(getConfig());
});

// ================================================================
// RUTAS: AUTH Y DATOS FRONTEND
// ================================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, rol: user.rol }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, rol: user.rol, username: user.username });
});

app.get('/api/estado', autenticar, (req, res) => {
  const ultima = db.prepare('SELECT * FROM lecturas ORDER BY id DESC LIMIT 1').get();
  res.json({ ultima_lectura: ultima || null, config: getConfig() });
});

app.get('/api/lecturas/recientes', autenticar, (req, res) => {
  const rows = db.prepare('SELECT * FROM lecturas ORDER BY id DESC LIMIT 60').all().reverse();
  res.json(rows);
});

app.get('/api/heatmap', autenticar, (req, res) => {
  const dias = parseInt(req.query.dias) || 7;
  const rows = db.prepare(`
    SELECT zona, date(timestamp) as fecha, SUM(conteo) as total
    FROM heatmap WHERE date(timestamp) >= date('now', '-${dias} days')
    GROUP BY fecha, zona ORDER BY fecha ASC
  `).all();

  const fechas = [...new Set(rows.map(r => r.fecha))];
  const zonas  = ['0-100mm', '100-200mm', '200-300mm', '300-400mm', '>400mm'];
  const data   = {};
  for (const z of zonas) {
    data[z] = fechas.map(f => {
      const r = rows.find(r => r.zona === z && r.fecha === f);
      return r ? r.total : 0;
    });
  }
  res.json({ fechas, zonas, data });
});

app.get('/api/estadisticas', autenticar, (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT COUNT(*) AS total, SUM(alerta) AS alertas, ROUND(AVG(distancia_mm)) AS promedio, MIN(distancia_mm) AS minima, MAX(distancia_mm) AS maxima
    FROM lecturas WHERE date(timestamp) = ?
  `).get(hoy);
  const ultimaAlertaRow = db.prepare(`SELECT timestamp FROM lecturas WHERE alerta = 1 AND date(timestamp) = ? ORDER BY id DESC LIMIT 1`).get(hoy);

  res.json({
    hoy: { total: row.total || 0, alertas: row.alertas || 0, promedio: row.promedio || null, minima: row.minima ?? null, maxima: row.maxima ?? null },
    ultima_alerta: ultimaAlertaRow?.timestamp || null,
  });
});

app.get('/api/registros', autenticar, (req, res) => {
  const { desde, hasta } = req.query;
  const rows = db.prepare(`SELECT * FROM lecturas WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`).all(desde, hasta);
  res.json(rows);
});

// (Exportaciones Excel y PDF se mantienen iguales)
app.get('/api/exportar/excel', autenticar, async (req, res) => {
  const { desde, hasta } = req.query;
  const rows = db.prepare(`SELECT * FROM lecturas WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`).all(desde, hasta);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Registros');
  ws.columns = [
    { header: 'ID', key: 'id', width: 8 }, { header: 'Timestamp', key: 'timestamp', width: 22 },
    { header: 'Distancia (mm)', key:'distancia_mm', width: 16 }, { header: 'Alerta', key: 'alerta', width: 10 }, { header: 'Sensor ID', key: 'sensor_id', width: 14 }
  ];
  ws.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const r of rows) {
    const row = ws.addRow({ ...r, alerta: r.alerta ? 'SÍ' : 'NO' });
    if (r.alerta) { row.getCell('alerta').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF4444' } }; row.getCell('alerta').font = { color: { argb: 'FFFFFFFF' }, bold: true }; }
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="registros_tof_${desde.slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

app.get('/api/exportar/pdf', autenticar, (req, res) => {
  const { desde, hasta } = req.query;
  const rows = db.prepare(`SELECT * FROM lecturas WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`).all(desde, hasta);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="registros_tof_${desde.slice(0,10)}.pdf"`);
  doc.pipe(res);
  doc.fillColor('#1E3A5F').fontSize(20).text('Sistema de Detección ToF', { align: 'center' });
  doc.moveDown(1);
  const colWidths = [40, 160, 100, 70, 100];
  const cols = ['ID', 'Timestamp', 'Distancia', 'Alerta', 'Sensor ID'];
  let x = 50;
  cols.forEach((c, i) => { doc.text(c, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
  doc.moveDown(0.5);
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const r = rows[i];
    x = 50;
    if (doc.y > 750) doc.addPage();
    const vals = [r.id, r.timestamp, r.distancia_mm + ' mm', r.alerta ? 'ALERTA' : 'OK', r.sensor_id];
    vals.forEach((v, ci) => { doc.text(String(v), x, doc.y, { width: colWidths[ci] }); x += colWidths[ci]; });
    doc.moveDown(0.4);
  }
  doc.end();
});

// ================================================================
// RUTAS: CONFIGURACIÓN 
// ================================================================
app.get('/api/config', autenticar, soloAdmin, (req, res) => {
  res.json(getConfig());
});

app.put('/api/config', autenticar, soloAdmin, (req, res) => {
  const campos = ['umbral_mm','tiempo_muestreo_s','cantidad_sensores','email_alertas','sistema_activo','sistema_id'];
  const update = db.prepare('UPDATE config SET valor = ? WHERE clave = ?');
  for (const k of campos) {
    if (req.body[k] !== undefined) update.run(String(req.body[k]), k);
  }
  mqttClient.publish('caece/tof/config', JSON.stringify(req.body));
  res.json({ ok: true, config: getConfig() });
});

app.post('/api/sistema/toggle', autenticar, soloAdmin, (req, res) => {
  const actual = getConfig().sistema_activo;
  const nuevo  = !actual;
  db.prepare("UPDATE config SET valor = ? WHERE clave = 'sistema_activo'").run(String(nuevo));
  mqttClient.publish('caece/tof/cmd', JSON.stringify({ activo: nuevo }));
  res.json({ sistema_activo: nuevo });
});

app.post('/api/buzzer/silenciar', autenticar, (req, res) => {
  const comando = req.body?.comando || 'SILENCIAR';
  mqttClient.publish('caece/tof/buzzer', comando);
  res.json({ ok: true, estado: comando });
});

app.listen(PORT, () => {
  console.log(`[API] Servidor (REST Only) en http://localhost:${PORT}`);
});