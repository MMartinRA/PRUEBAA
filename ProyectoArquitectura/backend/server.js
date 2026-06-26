/**
 * TOF Sistema - Backend
 * Express + SQLite + MQTT + JWT + Excel/PDF export + Email
 */

const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const mqtt       = require('mqtt');
const Database   = require('better-sqlite3');
const ExcelJS    = require('exceljs');
const PDFDocument= require('pdfkit');
const nodemailer = require('nodemailer');
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

// Valores de config por defecto
const configDefaults = {
  umbral_mm:         '200',
  tiempo_muestreo_s: '1',
  cantidad_sensores: '1',
  email_alertas:     'admin@ejemplo.com',
  sistema_activo:    'true',
  sistema_id:        'SENSOR-01'
};
const insertConfig = db.prepare(
  'INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)'
);
for (const [k, v] of Object.entries(configDefaults)) {
  insertConfig.run(k, v);
}

// Usuarios por defecto si no existen
const insertUsuario = db.prepare(
  'INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES (?, ?, ?)'
);
insertUsuario.run('admin',  bcrypt.hashSync('admin123', 10),  'admin');
insertUsuario.run('usuario', bcrypt.hashSync('user123', 10), 'usuario');

// ================================================================
// MQTT
// ================================================================
const mqttClient = mqtt.connect('mqtt://test.mosquitto.org:1883', {
  clientId: 'backend-tof-caece'
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado a test.mosquitto.org');
  mqttClient.subscribe(['caece/tof/distancia', 'caece/tof/evento']);
});

mqttClient.on('message', (topic, message) => {
  const cfg = getConfig();

  if (topic === 'caece/tof/distancia') {
    const dist = parseInt(message.toString());
    if (isNaN(dist) || !cfg.sistema_activo) return;

    const alerta = dist <= parseInt(cfg.umbral_mm) ? 1 : 0;
    db.prepare(
      'INSERT INTO lecturas (distancia_mm, alerta, sensor_id) VALUES (?, ?, ?)'
    ).run(dist, alerta, cfg.sistema_id);

    // Actualizar heatmap: dividimos el rango en 5 zonas (0-100, 100-200, ..., >400)
    const zona = distanciaAZona(dist);
    const hoy = new Date().toISOString().slice(0, 10);
    const existing = db.prepare(
      "SELECT id FROM heatmap WHERE zona = ? AND date(timestamp) = ?"
    ).get(zona, hoy);
    if (existing) {
      db.prepare("UPDATE heatmap SET conteo = conteo + 1 WHERE id = ?")
        .run(existing.id);
    } else {
      db.prepare("INSERT INTO heatmap (zona, conteo) VALUES (?, 1)").run(zona);
    }
  }

  if (topic === 'caece/tof/evento') {
    try {
      const evento = JSON.parse(message.toString());
      if (evento.evento === 'ALERTA' && cfg.email_alertas) {
        enviarEmailAlerta(cfg.email_alertas, evento);
      }
    } catch {}
  }
});

function distanciaAZona(mm) {
  if (mm <= 100)  return '0-100mm';
  if (mm <= 200)  return '100-200mm';
  if (mm <= 300)  return '200-300mm';
  if (mm <= 400)  return '300-400mm';
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
// EMAIL (configurado para Gmail con App Password o Mailtrap para dev)
// ================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'Tu_Gmail',     // tu Gmail
    pass: 'Tu_Password'          // App Password de 16 caracteres (sin espacios)
  }
});

async function enviarEmailAlerta(destino, evento) {
  try {
    await transporter.sendMail({
      from: 'sistema-tof@caece.edu.ar',
      to: destino,
      subject: `⚠️ Alerta ToF - Objeto detectado a ${evento.distancia_mm}mm`,
      html: `
        <h2>Alerta de proximidad detectada</h2>
        <p><strong>Distancia:</strong> ${evento.distancia_mm} mm</p>
        <p><strong>Umbral configurado:</strong> ${evento.umbral_mm} mm</p>
        <p><strong>Hora:</strong> ${new Date().toLocaleString('es-AR')}</p>
        <hr/>
        <p style="color:#888">Sistema de detección ToF - Universidad CAECE</p>
      `
    });
    console.log('[EMAIL] Alerta enviada a', destino);
  } catch (err) {
    console.error('[EMAIL] Error:', err.message);
  }
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
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

// ================================================================
// RUTAS: AUTH
// ================================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, rol: user.rol },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, rol: user.rol, username: user.username });
});

// ================================================================
// RUTAS: DATOS EN TIEMPO REAL (usuario y admin)
// ================================================================
app.get('/api/estado', autenticar, (req, res) => {
  const ultima = db.prepare(
    'SELECT * FROM lecturas ORDER BY id DESC LIMIT 1'
  ).get();
  const cfg = getConfig();
  res.json({ ultima_lectura: ultima || null, config: cfg });
});

app.get('/api/lecturas/recientes', autenticar, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM lecturas ORDER BY id DESC LIMIT 60'
  ).all().reverse();
  res.json(rows);
});

// ================================================================
// RUTAS: HEATMAP
// ================================================================
app.get('/api/heatmap', autenticar, (req, res) => {
  const dias = parseInt(req.query.dias) || 7;
  const rows = db.prepare(`
    SELECT zona, date(timestamp) as fecha, SUM(conteo) as total
    FROM heatmap
    WHERE date(timestamp) >= date('now', '-${dias} days')
    GROUP BY fecha, zona
    ORDER BY fecha ASC
  `).all();

  // Reorganizar para el frontend: { fechas: [...], zonas: {...} }
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

// ================================================================
// RUTAS: CONSULTA Y EXPORT (usuario)
// ================================================================
app.get('/api/registros', autenticar, (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ error: 'Faltan parámetros desde/hasta' });
  }
  const rows = db.prepare(`
    SELECT * FROM lecturas
    WHERE timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `).all(desde, hasta);
  res.json(rows);
});

app.get('/api/exportar/excel', autenticar, async (req, res) => {
  const { desde, hasta } = req.query;
  const rows = db.prepare(`
    SELECT * FROM lecturas WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC
  `).all(desde, hasta);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema ToF - CAECE';
  wb.created = new Date();

  const ws = wb.addWorksheet('Registros');
  ws.columns = [
    { header: 'ID',           key: 'id',           width: 8  },
    { header: 'Timestamp',    key: 'timestamp',    width: 22 },
    { header: 'Distancia (mm)',key:'distancia_mm', width: 16 },
    { header: 'Alerta',       key: 'alerta',       width: 10 },
    { header: 'Sensor ID',    key: 'sensor_id',    width: 14 }
  ];

  // Encabezado con estilo
  ws.getRow(1).eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });

  for (const r of rows) {
    const row = ws.addRow({
      ...r,
      alerta: r.alerta ? 'SÍ' : 'NO'
    });
    if (r.alerta) {
      row.getCell('alerta').fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF4444' }
      };
      row.getCell('alerta').font = { color: { argb: 'FFFFFFFF' }, bold: true };
    }
  }

  // Hoja de resumen
  const ws2 = wb.addWorksheet('Resumen');
  ws2.addRow(['Rango consultado', `${desde} → ${hasta}`]);
  ws2.addRow(['Total registros',  rows.length]);
  ws2.addRow(['Total alertas',    rows.filter(r => r.alerta).length]);
  const dists = rows.map(r => r.distancia_mm);
  if (dists.length) {
    ws2.addRow(['Distancia mínima (mm)', Math.min(...dists)]);
    ws2.addRow(['Distancia máxima (mm)', Math.max(...dists)]);
    ws2.addRow(['Distancia promedio (mm)', Math.round(dists.reduce((a,b)=>a+b,0)/dists.length)]);
  }

  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    `attachment; filename="registros_tof_${desde.slice(0,10)}_${hasta.slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

app.get('/api/exportar/pdf', autenticar, (req, res) => {
  const { desde, hasta } = req.query;
  const rows = db.prepare(`
    SELECT * FROM lecturas WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC
  `).all(desde, hasta);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="registros_tof_${desde.slice(0,10)}_${hasta.slice(0,10)}.pdf"`);
  doc.pipe(res);

  // Portada
  doc.fillColor('#1E3A5F').fontSize(20).text('Sistema de Detección de Distancia ToF', { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor('#555').fontSize(12).text('Universidad CAECE - Mar del Plata', { align: 'center' });
  doc.moveDown(0.3);
  doc.text(`Rango: ${desde}  →  ${hasta}`, { align: 'center' });
  doc.moveDown(1);

  // Resumen
  const alertas = rows.filter(r => r.alerta).length;
  doc.fillColor('#1E3A5F').fontSize(14).text('Resumen');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1E3A5F');
  doc.moveDown(0.3);
  doc.fillColor('#222').fontSize(11);
  doc.text(`Total de registros: ${rows.length}`);
  doc.text(`Total de alertas:   ${alertas}`);
  if (rows.length) {
    const dists = rows.map(r => r.distancia_mm);
    doc.text(`Distancia mínima:  ${Math.min(...dists)} mm`);
    doc.text(`Distancia máxima:  ${Math.max(...dists)} mm`);
    doc.text(`Distancia promedio: ${Math.round(dists.reduce((a,b)=>a+b,0)/dists.length)} mm`);
  }
  doc.moveDown(1);

  // Tabla
  doc.fillColor('#1E3A5F').fontSize(14).text('Registros detallados');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1E3A5F');
  doc.moveDown(0.3);

  // Encabezado de tabla
  const colWidths = [40, 160, 100, 70, 100];
  const cols = ['ID', 'Timestamp', 'Distancia (mm)', 'Alerta', 'Sensor ID'];
  let x = 50;
  doc.fillColor('#1E3A5F').fontSize(10);
  cols.forEach((c, i) => { doc.text(c, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#CCC');
  doc.moveDown(0.2);

  // Filas (máximo 200 para que no explote el PDF)
  const limit = Math.min(rows.length, 200);
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    const y = doc.y;
    x = 50;
    if (doc.y > 750) { doc.addPage(); }
    doc.fillColor(r.alerta ? '#CC0000' : '#222').fontSize(9);
    const vals = [r.id, r.timestamp, r.distancia_mm + ' mm', r.alerta ? 'ALERTA' : 'OK', r.sensor_id];
    vals.forEach((v, ci) => {
      doc.text(String(v), x, y, { width: colWidths[ci] });
      x += colWidths[ci];
    });
    doc.moveDown(0.4);
  }
  if (rows.length > 200) {
    doc.fillColor('#888').text(`... y ${rows.length - 200} registros más (ver Excel para listado completo)`);
  }

  doc.end();
});

// ================================================================
// RUTAS: CONFIGURACIÓN (solo admin)
// ================================================================
app.get('/api/config', autenticar, soloAdmin, (req, res) => {
  res.json(getConfig());
});

app.put('/api/config', autenticar, soloAdmin, (req, res) => {
  const campos = ['umbral_mm','tiempo_muestreo_s','cantidad_sensores',
                  'email_alertas','sistema_activo','sistema_id'];
  const update = db.prepare('UPDATE config SET valor = ? WHERE clave = ?');
  for (const k of campos) {
    if (req.body[k] !== undefined) {
      update.run(String(req.body[k]), k);
    }
  }
  // Publicar nueva config al ESP32 vía MQTT
  mqttClient.publish('caece/tof/config', JSON.stringify(req.body));
  res.json({ ok: true, config: getConfig() });
});

// Encendido/apagado remoto
app.post('/api/sistema/toggle', autenticar, soloAdmin, (req, res) => {
  const actual = getConfig().sistema_activo;
  const nuevo  = !actual;
  db.prepare("UPDATE config SET valor = ? WHERE clave = 'sistema_activo'")
    .run(String(nuevo));
  mqttClient.publish('caece/tof/cmd', JSON.stringify({ activo: nuevo }));
  res.json({ sistema_activo: nuevo });
});

// ================================================================
app.listen(PORT, () => {
  console.log(`[API] Servidor en http://localhost:${PORT}`);
});