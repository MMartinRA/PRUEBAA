import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:3001/api";

function apiFetch(path, token, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  }).then((r) => r.json());
}

function Badge({ ok }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99,
      fontSize: 12, fontWeight: 500,
      background: ok ? "#d1fae5" : "#fee2e2",
      color: ok ? "#065f46" : "#991b1b",
    }}>
      {ok ? "OK" : "ALERTA"}
    </span>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [form, setForm]       = useState({ username: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (data.token) onLogin(data);
      else setError(data.error || "Error al iniciar sesión");
    } catch { setError("No se pudo conectar al servidor"); }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#f8fafc",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, border: "0.5px solid #e2e8f0",
        padding: "2.5rem 2rem", width: 360, boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#1e40af",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
          }}>
            <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", margin: 0 }}>Sistema ToF</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Detección de distancia · Universidad CAECE
          </p>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>Usuario</label>
            <input type="text" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="admin / usuario"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 4 }}>Contraseña</label>
            <input type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="admin123 / user123"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8,
                border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "10px", borderRadius: 8, border: "none",
            background: loading ? "#93c5fd" : "#1d4ed8", color: "#fff",
            fontSize: 14, fontWeight: 500, cursor: loading ? "default" : "pointer",
          }}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 20, marginBottom: 0 }}>
          admin/admin123 · usuario/user123
        </p>
      </div>
    </div>
  );
}

// ── BUZZER PANEL ─────────────────────────────────────────────────
function BuzzerPanel({ token, modo, onModoChange }) {
  const [loading, setLoading] = useState(false);

  async function publicar(cmd) {
    setLoading(true);
    try {
      await apiFetch("/buzzer/silenciar", token, {
        method: "POST",
        body: JSON.stringify({ comando: cmd }),
      });
    } catch {}
    setLoading(false);
  }

  async function setModo(nuevoModo) {
    await publicar(nuevoModo);
    onModoChange(nuevoModo);
  }

  async function silenciarManual() {
    await publicar("SILENCIAR");
  }

  const opciones = [
    {
      id: "auto",
      label: "Automático",
      desc: "Suena con la alerta, se apaga solo al volver al rango normal",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          <path d="M12 2v2M19.07 4.93l-1.41 1.41M22 12h-2M19.07 19.07l-1.41-1.41"/>
        </svg>
      ),
      color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe",
    },
    {
      id: "manual",
      label: "Manual",
      desc: "Suena con la alerta y requiere silenciarlo manualmente",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
      color: "#d97706", bg: "#fffbeb", border: "#fde68a",
    },
    {
      id: "off",
      label: "Apagado",
      desc: "El buzzer nunca suena, independientemente del umbral",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          <line x1="2" y1="2" x2="22" y2="22"/>
        </svg>
      ),
      color: "#64748b", bg: "#f8fafc", border: "#e2e8f0",
    },
  ];

  const actual = opciones.find((o) => o.id === modo) || opciones[0];

  return (
    <div style={{
      background: "#fff", borderRadius: 12,
      border: `1.5px solid ${actual.border}`,
      padding: "1.25rem", marginBottom: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: actual.bg, color: actual.color,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {actual.icon}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Buzzer</p>
            <p style={{ margin: 0, fontSize: 12, color: actual.color }}>{actual.desc}</p>
          </div>
        </div>
        {modo === "manual" && (
          <button onClick={silenciarManual} disabled={loading} style={{
            padding: "6px 14px", borderRadius: 8, border: "1px solid #fde68a",
            background: "#fffbeb", color: "#b45309",
            fontSize: 12, fontWeight: 500, cursor: loading ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}>
            🔇 Silenciar ahora
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {opciones.map((op) => (
          <button key={op.id} onClick={() => setModo(op.id)}
            disabled={loading || modo === op.id}
            style={{
              padding: "10px 8px", borderRadius: 10,
              cursor: modo === op.id ? "default" : "pointer",
              border: `1.5px solid ${modo === op.id ? op.color : "#e2e8f0"}`,
              background: modo === op.id ? op.bg : "#f8fafc",
              color: modo === op.id ? op.color : "#64748b",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              opacity: loading ? 0.7 : 1, transition: "all 0.15s",
            }}>
            <span style={{ color: modo === op.id ? op.color : "#94a3b8" }}>{op.icon}</span>
            <span style={{ fontSize: 12, fontWeight: modo === op.id ? 600 : 400 }}>{op.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ESTADÍSTICAS DEL DÍA ─────────────────────────────────────────
function EstadisticasHoy({ stats }) {
  if (!stats) return null;
  const { hoy, ultima_alerta } = stats;
  const pctAlertas = hoy.total > 0 ? Math.round((hoy.alertas / hoy.total) * 100) : 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0",
      padding: "1.25rem", marginBottom: 24,
    }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 500, color: "#0f172a" }}>
        Estadísticas de hoy
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatMini label="Lecturas"    value={hoy.total ?? 0}                              color="#1d4ed8" />
        <StatMini label="Alertas"     value={hoy.alertas ?? 0}                            color="#dc2626" />
        <StatMini label="Prom. dist." value={hoy.promedio ? `${hoy.promedio} mm` : "—"}  color="#7c3aed" />
        <StatMini label="Dist. mín."  value={hoy.minima != null ? `${hoy.minima} mm` : "—"} color="#ea580c" />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>% de lecturas en alerta</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: pctAlertas > 50 ? "#dc2626" : "#374151" }}>
            {pctAlertas}%
          </span>
        </div>
        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pctAlertas}%`,
            background: pctAlertas > 50 ? "#dc2626" : pctAlertas > 20 ? "#f59e0b" : "#16a34a",
            borderRadius: 99, transition: "width 0.4s",
          }} />
        </div>
        {ultima_alerta && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Última alerta: {ultima_alerta}
          </p>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value, color }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", borderTop: `3px solid ${color}` }}>
      <p style={{ margin: "0 0 2px", fontSize: 11, color: "#64748b" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{value}</p>
    </div>
  );
}

// ── SLIDER DE UMBRAL EN VIVO ──────────────────────────────────────
function SliderUmbral({ token, umbralActual, onUmbralChange }) {
  const [valor, setValor]   = useState(parseInt(umbralActual) || 200);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const timeoutRef          = useRef(null);

  useEffect(() => { setValor(parseInt(umbralActual) || 200); }, [umbralActual]);

  function handleChange(e) {
    const v = parseInt(e.target.value);
    setValor(v);
    setMsg("");
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => aplicar(v), 600);
  }

  async function aplicar(v) {
    setSaving(true);
    try {
      await apiFetch("/config", token, {
        method: "PUT",
        body: JSON.stringify({ umbral_mm: String(v) }),
      });
      onUmbralChange(v);
      setMsg(`Umbral actualizado a ${v} mm`);
      setTimeout(() => setMsg(""), 2500);
    } catch { setMsg("Error al actualizar"); }
    setSaving(false);
  }

  const color = valor < 150 ? "#dc2626" : valor < 350 ? "#f59e0b" : "#16a34a";

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#0f172a" }}>Umbral de alerta en vivo</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 12, color: "#94a3b8" }}>Guardando…</span>}
          {msg && !saving && <span style={{ fontSize: 12, color: "#16a34a" }}>{msg}</span>}
          <span style={{ fontSize: 20, fontWeight: 700, color, minWidth: 72, textAlign: "right" }}>{valor} mm</span>
        </div>
      </div>
      <input type="range" min={50} max={1000} step={10} value={valor}
        onChange={handleChange}
        style={{ width: "100%", accentColor: color, cursor: "pointer", height: 6 }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {[50, 200, 400, 600, 800, 1000].map((v) => (
          <span key={v} style={{ fontSize: 10, color: "#94a3b8" }}>{v}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {[100, 200, 300, 500].map((v) => (
          <button key={v} onClick={() => { setValor(v); aplicar(v); }} style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 12,
            border: `1px solid ${valor === v ? color : "#e2e8f0"}`,
            background: valor === v ? "#f8fafc" : "transparent",
            color: valor === v ? color : "#64748b",
            cursor: "pointer", fontWeight: valor === v ? 600 : 400,
          }}>
            {v} mm
          </button>
        ))}
      </div>
    </div>
  );
}

// ── SELECTOR DE INTERVALO DE MUESTREO ────────────────────────────
function SelectorMuestreo({ token, valorActual, onChange }) {
  const [saving, setSaving] = useState(false);
  const [activo, setActivo] = useState(parseInt(valorActual) || 1);

  useEffect(() => { setActivo(parseInt(valorActual) || 1); }, [valorActual]);

  async function seleccionar(v) {
    setActivo(v);
    setSaving(true);
    try {
      await apiFetch("/config", token, {
        method: "PUT",
        body: JSON.stringify({ tiempo_muestreo_s: String(v) }),
      });
      onChange(v);
    } catch {}
    setSaving(false);
  }

  const opciones = [
    { v: 1,  label: "1 s",  desc: "Tiempo real" },
    { v: 2,  label: "2 s",  desc: "Estándar" },
    { v: 5,  label: "5 s",  desc: "Ahorro" },
    { v: 10, label: "10 s", desc: "Bajo consumo" },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#0f172a" }}>Intervalo de muestreo</h3>
        {saving && <span style={{ fontSize: 12, color: "#94a3b8" }}>Aplicando…</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {opciones.map(({ v, label, desc }) => (
          <button key={v} onClick={() => seleccionar(v)} style={{
            padding: "10px 8px", borderRadius: 10, cursor: "pointer",
            border: `1.5px solid ${activo === v ? "#1d4ed8" : "#e2e8f0"}`,
            background: activo === v ? "#eff6ff" : "#f8fafc",
            color: activo === v ? "#1d4ed8" : "#374151",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{label}</span>
            <span style={{ fontSize: 10, color: activo === v ? "#3b82f6" : "#94a3b8" }}>{desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── INDICADOR DE TENDENCIA ────────────────────────────────────────
function TendenciaIndicador({ history }) {
  if (!history || history.length < 5) return null;

  const ultimos = history.slice(-5).map((d) => d.distancia_mm);
  const n       = ultimos.length;
  const sumX    = ultimos.reduce((a, _, i) => a + i, 0);
  const sumY    = ultimos.reduce((a, v) => a + v, 0);
  const sumXY   = ultimos.reduce((a, v, i) => a + i * v, 0);
  const sumX2   = ultimos.reduce((a, _, i) => a + i * i, 0);
  const pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const diffAbs = Math.abs(ultimos[n - 1] - ultimos[0]);

  let icono, label, color, bg;
  if (Math.abs(pendiente) < 5) {
    icono = "→"; label = "Estable"; color = "#374151"; bg = "#f1f5f9";
  } else if (pendiente < 0) {
    icono = "↓"; label = `Acercándose ${diffAbs} mm`; color = "#dc2626"; bg = "#fef2f2";
  } else {
    icono = "↑"; label = `Alejándose ${diffAbs} mm`; color = "#16a34a"; bg = "#f0fdf4";
  }

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: bg, border: `1px solid ${color}22`,
      borderRadius: 8, padding: "5px 12px",
    }}>
      <span style={{ fontSize: 18, color, lineHeight: 1 }}>{icono}</span>
      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>(últimas 5)</span>
    </div>
  );
}

// ── GRÁFICO ───────────────────────────────────────────────────────
function SparkChart({ data, umbral }) {
  if (!data.length) return <p style={{ color: "#94a3b8", fontSize: 13 }}>Sin datos aún.</p>;
  const values = data.map((d) => d.distancia_mm);
  const max    = Math.max(...values, umbral * 1.5);
  const W = 620, H = 160, PAD = 12;

  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1 || 1)) * (W - PAD * 2);
    const y = PAD + (1 - v / max) * (H - PAD * 2);
    return [x, y];
  });

  const polyline  = pts.map((p) => p.join(",")).join(" ");
  const umbralY   = PAD + (1 - umbral / max) * (H - PAD * 2);
  const areaPoints = [
    `${pts[0][0]},${H - PAD}`,
    ...pts.map((p) => p.join(",")),
    `${pts[pts.length - 1][0]},${H - PAD}`,
  ].join(" ");
  const yTicks = [0, Math.round(max * 0.25), Math.round(max * 0.5), Math.round(max * 0.75), Math.round(max)];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => {
        const y = PAD + (1 - t / max) * (H - PAD * 2);
        return (
          <g key={t}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD - 2} y={y + 3} fontSize={9} fill="#94a3b8" textAnchor="end">{t}</text>
          </g>
        );
      })}
      <polygon points={areaPoints} fill="url(#areaGrad)" />
      <line x1={PAD} y1={umbralY} x2={W - PAD} y2={umbralY}
        stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - PAD - 4} y={umbralY - 4} fontSize={10} fill="#dc2626" textAnchor="end">
        umbral {umbral}mm
      </text>
      <rect x={PAD} y={umbralY} width={W - PAD * 2} height={H - PAD - umbralY}
        fill="#dc2626" fillOpacity="0.04" />
      <polyline points={polyline} fill="none" stroke="#1d4ed8" strokeWidth="2" />
      {pts.map(([x, y], i) => data[i]?.alerta ? (
        <circle key={i} cx={x} cy={y} r="3" fill="#dc2626" />
      ) : null)}
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]}
          r="4" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// ── HEATMAP ───────────────────────────────────────────────────────
function HeatmapGrid({ heatmap }) {
  const { fechas, zonas, data } = heatmap;
  if (!fechas.length) return <p style={{ color: "#94a3b8", fontSize: 13 }}>Sin datos de heatmap aún.</p>;

  const allVals = zonas.flatMap((z) => data[z] || []);
  const maxVal  = Math.max(...allVals, 1);

  function heatColor(val) {
    const t = val / maxVal;
    if (t === 0)  return "#f1f5f9";
    if (t < 0.25) return "#bfdbfe";
    if (t < 0.5)  return "#60a5fa";
    if (t < 0.75) return "#2563eb";
    return "#1e3a8a";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 10px", textAlign: "left", color: "#64748b", fontWeight: 500 }}>Zona</th>
            {fechas.map((f) => (
              <th key={f} style={{ padding: "6px 8px", color: "#64748b", fontWeight: 500, textAlign: "center" }}>
                {f.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zonas.map((zona) => (
            <tr key={zona}>
              <td style={{ padding: "6px 10px", color: "#374151", fontWeight: 500, whiteSpace: "nowrap" }}>{zona}</td>
              {(data[zona] || []).map((val, i) => {
                const t = val / maxVal;
                return (
                  <td key={i} style={{
                    padding: "8px 6px", textAlign: "center", borderRadius: 6,
                    background: heatColor(val),
                    color: t > 0.4 ? "#fff" : "#1e40af",
                    fontWeight: val > 0 ? 500 : 400, minWidth: 48,
                  }}>
                    {val || "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11, color: "#64748b" }}>
        <span>Menor actividad</span>
        {["#f1f5f9","#bfdbfe","#60a5fa","#2563eb","#1e3a8a"].map((c) => (
          <span key={c} style={{ width: 18, height: 14, borderRadius: 3, background: c, display: "inline-block" }} />
        ))}
        <span>Mayor actividad</span>
      </div>
    </div>
  );
}

// ── TABLA DE ALERTAS FILTRABLE ────────────────────────────────────
function TablaAlertas({ history }) {
  const [filtro, setFiltro]     = useState("alertas");
  const [busqueda, setBusqueda] = useState("");

  const filas = (history || [])
    .filter((r) => {
      if (filtro === "alertas") return r.alerta === 1;
      if (filtro === "ok")      return r.alerta === 0;
      return true;
    })
    .filter((r) =>
      busqueda === "" ||
      String(r.distancia_mm).includes(busqueda) ||
      (r.sensor_id || "").toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.timestamp || "").includes(busqueda)
    );

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0",
      overflow: "hidden", marginBottom: 24,
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "0.5px solid #e2e8f0",
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#0f172a", marginRight: 4 }}>
          Lecturas recientes
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "todos",   label: "Todos" },
            { key: "alertas", label: "Solo alertas" },
            { key: "ok",      label: "Solo OK" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFiltro(key)} style={{
              padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
              background: filtro === key ? "#eff6ff" : "#fff",
              color: filtro === key ? "#1d4ed8" : "#64748b",
              fontSize: 12, cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>
        <input placeholder="Buscar…" value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            marginLeft: "auto", padding: "5px 10px", borderRadius: 8,
            border: "1px solid #e2e8f0", fontSize: 12, width: 140,
          }} />
      </div>
      <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
            <tr>
              {["ID","Timestamp","Distancia (mm)","Estado","Sensor"].map((h) => (
                <th key={h} style={{
                  padding: "8px 14px", textAlign: "left", color: "#64748b",
                  fontWeight: 500, borderBottom: "0.5px solid #e2e8f0",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0
              ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>Sin registros.</td></tr>
              : filas.slice(0, 100).map((r) => (
                <tr key={r.id} style={{ background: r.alerta ? "#fff7f7" : "transparent" }}>
                  <td style={{ padding: "7px 14px", color: "#94a3b8" }}>{r.id}</td>
                  <td style={{ padding: "7px 14px", color: "#374151", whiteSpace: "nowrap" }}>{r.timestamp}</td>
                  <td style={{ padding: "7px 14px", fontWeight: 500, color: "#0f172a" }}>{r.distancia_mm} mm</td>
                  <td style={{ padding: "7px 14px" }}><Badge ok={!r.alerta} /></td>
                  <td style={{ padding: "7px 14px", color: "#64748b" }}>{r.sensor_id}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      {filas.length > 100 && (
        <p style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 12, margin: 0 }}>
          Mostrando 100 de {filas.length} — usá Registros para exportar todos.
        </p>
      )}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────
function Dashboard({ token }) {
  const [estado, setEstado]         = useState(null);
  const [history, setHistory]       = useState([]);
  const [heatmap, setHeatmap]       = useState(null);
  const [stats, setStats]           = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertasSession, setAlertasSession] = useState(0);
  const [buzzerModo, setBuzzerModo] = useState("auto");
  const prevAlertaRef = useRef(null);
  const intervalRef   = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const [est, rec, hm, st] = await Promise.all([
        apiFetch("/estado", token),
        apiFetch("/lecturas/recientes", token),
        apiFetch("/heatmap?dias=7", token),
        apiFetch("/estadisticas", token),
      ]);
      setEstado(est);
      setHistory(rec);
      setHeatmap(hm);
      setStats(st);
      if (est?.ultima_lectura) {
        const esAlerta = est.ultima_lectura.alerta === 1;
        if (esAlerta && prevAlertaRef.current === false) {
          setAlertasSession((n) => n + 1);
        }
        prevAlertaRef.current = esAlerta;
      }
    } catch {}
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(cargar, 2000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, cargar]);

  const ultima    = estado?.ultima_lectura;
  const cfg       = estado?.config || {};
  const hayAlerta = ultima?.alerta === 1;

  function handleUmbralChange(v) {
    setEstado((est) => est ? { ...est, config: { ...est.config, umbral_mm: String(v) } } : est);
  }

  function handleMuestreoChange(v) {
    setEstado((est) => est ? { ...est, config: { ...est.config, tiempo_muestreo_s: String(v) } } : est);
  }

  return (
    <div>
      {/* Barra de controles */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569",
          cursor: "pointer", background: "#fff", border: "0.5px solid #e2e8f0",
          borderRadius: 8, padding: "6px 14px",
        }}>
          <span style={{
            width: 36, height: 20, borderRadius: 99,
            background: autoRefresh ? "#1d4ed8" : "#e2e8f0",
            position: "relative", display: "inline-block", transition: "background 0.2s",
          }}>
            <span style={{
              position: "absolute", top: 3, left: autoRefresh ? 18 : 3,
              width: 14, height: 14, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s",
            }} />
          </span>
          <input type="checkbox" checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ display: "none" }} />
          Auto-refresco (2s)
        </label>

        {!autoRefresh && (
          <button onClick={cargar} style={{
            padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
            background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer",
          }}>
            ↻ Actualizar ahora
          </button>
        )}

        {alertasSession > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#fef2f2", border: "1px solid #fca5a5",
            borderRadius: 8, padding: "5px 12px", fontSize: 13, color: "#991b1b",
          }}>
            <span>⚠️</span>
            <span><strong>{alertasSession}</strong> {alertasSession === 1 ? "alerta" : "alertas"} en esta sesión</span>
            <button onClick={() => setAlertasSession(0)} style={{
              background: "none", border: "none", color: "#991b1b",
              cursor: "pointer", fontSize: 14, padding: "0 0 0 4px", lineHeight: 1,
            }}>×</button>
          </div>
        )}

        <TendenciaIndicador history={history} />
      </div>

      {/* Tarjetas métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <MetricCard
          label="Distancia actual"
          value={ultima ? `${ultima.distancia_mm} mm` : "—"}
          sub={ultima ? <Badge ok={!ultima.alerta} /> : "Sin datos"}
          accent={hayAlerta ? "#dc2626" : "#16a34a"}
        />
        <MetricCard
          label="Umbral configurado"
          value={cfg.umbral_mm ? `${cfg.umbral_mm} mm` : "—"}
          sub="Límite de alerta"
          accent="#1d4ed8"
        />
        <MetricCard
          label="Sensor ID"
          value={cfg.sistema_id || "—"}
          sub="Identificador EEPROM"
          accent="#7c3aed"
        />
        <MetricCard
          label="Sistema"
          value={cfg.sistema_activo === "true" || cfg.sistema_activo === true ? "Activo" : "Detenido"}
          sub={`Muestreo cada ${cfg.tiempo_muestreo_s || "—"}s`}
          accent={cfg.sistema_activo === "true" || cfg.sistema_activo === true ? "#16a34a" : "#9ca3af"}
        />
      </div>

      {/* Buzzer */}
      <BuzzerPanel token={token} modo={buzzerModo} onModoChange={setBuzzerModo} />

      {/* Slider umbral + selector muestreo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 4 }}>
        <SliderUmbral token={token} umbralActual={cfg.umbral_mm} onUmbralChange={handleUmbralChange} />
        <SelectorMuestreo token={token} valorActual={cfg.tiempo_muestreo_s} onChange={handleMuestreoChange} />
      </div>

      {/* Estadísticas del día */}
      <EstadisticasHoy stats={stats} />

      {/* Gráfico */}
      <div style={{
        background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0",
        padding: "1.25rem", marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#0f172a" }}>
            Distancia en tiempo real
          </h3>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {history.length} lecturas · <span style={{ color: "#dc2626" }}>● puntos en alerta</span>
          </span>
        </div>
        <SparkChart data={history} umbral={parseInt(cfg.umbral_mm) || 200} />
      </div>

      {/* Tabla filtrable */}
      <TablaAlertas history={history} />

      {/* Heatmap */}
      {heatmap && (
        <div style={{
          background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem",
        }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 500, color: "#0f172a" }}>
            Mapa de calor — detecciones por zona (últimos 7 días)
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
            Cada celda indica cuántas veces se registró actividad en esa franja de distancia en el día.
          </p>
          <HeatmapGrid heatmap={heatmap} />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "1rem", borderLeft: `3px solid ${accent}` }}>
      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#64748b" }}>{label}</p>
      <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600, color: "#0f172a" }}>{value}</p>
      <div style={{ fontSize: 12 }}>{sub}</div>
    </div>
  );
}

// ── REGISTROS ─────────────────────────────────────────────────────
function Registros({ token }) {
  const ahora    = new Date();
  const fmtLocal = (d) => d.toISOString().slice(0, 16);
  const [desde, setDesde]           = useState(fmtLocal(new Date(ahora - 24 * 3600000)));
  const [hasta, setHasta]           = useState(fmtLocal(ahora));
  const [rows, setRows]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [filtroAlerta, setFiltroAlerta] = useState("todos");

  async function buscar() {
    setLoading(true);
    const data = await apiFetch(
      `/registros?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, token
    );
    setRows(data);
    setLoading(false);
  }

  async function descargar(tipo) {
    const res = await fetch(
      `${API}/exportar/${tipo}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `registros_tof.${tipo === "excel" ? "xlsx" : "pdf"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rowsFiltrados = rows
    ? rows.filter((r) => {
        if (filtroAlerta === "alertas") return r.alerta === 1;
        if (filtroAlerta === "ok")      return r.alerta === 0;
        return true;
      })
    : null;

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Desde</label>
            <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Hasta</label>
            <input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }} />
          </div>
          <button onClick={buscar} disabled={loading} style={{
            padding: "8px 18px", borderRadius: 8, border: "none",
            background: "#1d4ed8", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
          <button onClick={() => descargar("excel")} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid #16a34a",
            background: "#f0fdf4", color: "#15803d", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>↓ Excel</button>
          <button onClick={() => descargar("pdf")} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid #dc2626",
            background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>↓ PDF</button>
        </div>
      </div>

      {rowsFiltrados !== null && (
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{
            padding: "12px 16px", borderBottom: "0.5px solid #e2e8f0",
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
          }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              {rows.length} registros totales · {rows.filter((r) => r.alerta).length} alertas
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { key: "todos",   label: "Todos" },
                { key: "alertas", label: "Solo alertas" },
                { key: "ok",      label: "Solo OK" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltroAlerta(key)} style={{
                  padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
                  background: filtroAlerta === key ? "#eff6ff" : "#fff",
                  color: filtroAlerta === key ? "#1d4ed8" : "#64748b",
                  fontSize: 12, cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["ID","Timestamp","Distancia (mm)","Estado","Sensor"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left", color: "#64748b",
                      fontWeight: 500, borderBottom: "0.5px solid #e2e8f0",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsFiltrados.slice(0, 200).map((r) => (
                  <tr key={r.id} style={{ background: r.alerta ? "#fff7f7" : "transparent" }}>
                    <td style={{ padding: "8px 14px", color: "#94a3b8" }}>{r.id}</td>
                    <td style={{ padding: "8px 14px", color: "#374151" }}>{r.timestamp}</td>
                    <td style={{ padding: "8px 14px", fontWeight: 500, color: "#0f172a" }}>{r.distancia_mm} mm</td>
                    <td style={{ padding: "8px 14px" }}><Badge ok={!r.alerta} /></td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>{r.sensor_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowsFiltrados.length === 0 && (
            <p style={{ padding: "20px 16px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
              No hay registros con el filtro seleccionado.
            </p>
          )}
          {rowsFiltrados.length > 200 && (
            <p style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12 }}>
              Mostrando primeros 200 — el Excel/PDF incluye todos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────────
function Configuracion({ token }) {
  const [cfg, setCfg]       = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    apiFetch("/config", token).then((d) => { if (d && !d.error) setCfg(d); });
  }, [token]);

  async function guardar() {
    setSaving(true); setMsg("");
    const res = await apiFetch("/config", token, { method: "PUT", body: JSON.stringify(cfg) });
    if (res.ok) setMsg("Configuración guardada y enviada al sensor.");
    else setMsg("Error al guardar.");
    setSaving(false);
  }

  async function toggleSistema() {
    const res = await apiFetch("/sistema/toggle", token, { method: "POST" });
    setCfg((c) => ({ ...c, sistema_activo: String(res.sistema_activo) }));
    setMsg(res.sistema_activo ? "Sistema activado remotamente." : "Sistema detenido remotamente.");
  }

  if (!cfg) return <p style={{ color: "#64748b" }}>Cargando configuración…</p>;

  const field = (label, key, type = "text", extra = {}) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type} value={cfg[key] ?? ""}
        onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", ...extra,
        }} />
    </div>
  );

  const activo = cfg.sistema_activo === "true" || cfg.sistema_activo === true;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 500, color: "#0f172a" }}>
            Parámetros del sensor
          </h3>
          {field("Umbral de alarma (mm)", "umbral_mm", "number")}
          {field("Tiempo entre muestras (s)", "tiempo_muestreo_s", "number")}
          {field("Cantidad de sensores conectados", "cantidad_sensores", "number")}
          {field("ID del sistema (guardada en EEPROM)", "sistema_id")}
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #e2e8f0", padding: "1.25rem" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 500, color: "#0f172a" }}>
            Notificaciones y control
          </h3>
          {field("Email para reportes de eventos", "email_alertas", "email")}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginBottom: 8 }}>
              Estado del sistema
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 99,
                background: activo ? "#d1fae5" : "#f1f5f9",
                color: activo ? "#065f46" : "#64748b",
                fontSize: 13, fontWeight: 500,
              }}>
                {activo ? "Activo" : "Detenido"}
              </span>
              <button onClick={toggleSistema} style={{
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${activo ? "#dc2626" : "#16a34a"}`,
                background: "transparent",
                color: activo ? "#dc2626" : "#16a34a",
                fontSize: 13, cursor: "pointer", fontWeight: 500,
              }}>
                {activo ? "Detener" : "Activar"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
              Publica el comando vía MQTT al ESP32.
            </p>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={guardar} disabled={saving} style={{
          padding: "9px 24px", borderRadius: 8, border: "none",
          background: saving ? "#93c5fd" : "#1d4ed8", color: "#fff",
          fontSize: 14, fontWeight: 500, cursor: saving ? "default" : "pointer",
        }}>
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
        {msg && <span style={{ fontSize: 13, color: "#16a34a" }}>{msg}</span>}
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
        Los cambios se publican automáticamente vía MQTT para que el ESP32 los aplique.
      </p>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(null);
  const [tab, setTab]   = useState("dashboard");

  if (!auth) return <Login onLogin={setAuth} />;

  const esAdmin = auth.rol === "admin";
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "registros", label: "Registros" },
    ...(esAdmin ? [{ id: "config", label: "Configuración" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{
        background: "#fff", borderBottom: "0.5px solid #e2e8f0",
        padding: "0 24px", display: "flex", alignItems: "center", gap: 0, height: 56,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, background: "#1e40af",
          display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12,
        }}>
          <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", marginRight: 32 }}>Sistema ToF</span>
        <nav style={{ display: "flex", gap: 2, flex: 1 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: tab === t.id ? "#eff6ff" : "transparent",
              color: tab === t.id ? "#1d4ed8" : "#64748b",
              fontSize: 13, fontWeight: tab === t.id ? 500 : 400, cursor: "pointer",
            }}>
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: esAdmin ? "#eff6ff" : "#f0fdf4",
            color: esAdmin ? "#1d4ed8" : "#15803d",
            fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99,
          }}>
            {auth.rol.toUpperCase()}
          </span>
          <span style={{ fontSize: 13, color: "#374151" }}>{auth.username}</span>
          <button onClick={() => setAuth(null)} style={{
            padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0",
            background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer",
          }}>
            Salir
          </button>
        </div>
      </div>
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 500, color: "#0f172a" }}>
          {tabs.find((t) => t.id === tab)?.label}
        </h2>
        {tab === "dashboard" && <Dashboard token={auth.token} />}
        {tab === "registros" && <Registros token={auth.token} />}
        {tab === "config"    && esAdmin && <Configuracion token={auth.token} />}
      </div>
    </div>
  );
}