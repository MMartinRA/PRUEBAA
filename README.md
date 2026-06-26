# Sistema ToF (HC-SR04) — Guía de configuración

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- [Node.js 18+](https://nodejs.org/) instalado
- Cuenta en [wokwi.com](https://wokwi.com) (gratis)

---

## 1. Descargar el proyecto

Descomprimí el archivo `tof-sistema-completo.zip`. Vas a tener esta estructura:

```text
tof-sistema/
├── sketch_v2.ino          ← Firmware del ESP32 (Sensor/Actuador Edge)
├── diagram.json           ← Circuito para Wokwi
├── libraries.txt          ← Librerías para Wokwi
├── docker-compose.yml     ← Contenedores (API y Node-RED)
├── nodered/
│   └── node-red-flow.json ← Motor de reglas / ESB (Nuevo cerebro del sistema)
├── backend/
│   ├── server.js          ← API REST pura + SQLite
│   └── package.json
└── frontend/
    ├── src/App.jsx        ← Dashboard SPA en React
    └── package.json
```

---

## 2. Levantar la infraestructura con Docker

Desde la carpeta raíz del proyecto:

```bash
docker compose up -d
```

Esto levanta:
- **Backend (API)** en `http://localhost:3001`
- **Node-RED (Orquestador)** en `http://localhost:1880`

Para verificar que están corriendo:

```bash
docker compose ps
```

> La primera vez tarda un par de minutos porque instala las dependencias de Node dentro del contenedor.

---

## 3. Configurar Node-RED y el Email de Alertas (¡Importante!)

Como ahora Node-RED es el orquestador, **debe estar configurado para que los datos lleguen al backend y se envíen los mails**.

1. Abrí `http://localhost:1880` en tu navegador.
2. Menú (☰ arriba a la derecha) → **Manage palette** → pestaña **Install**.
3. Buscá e instalá estas dos librerías:
   - `node-red-dashboard`
   - `node-red-node-email`
4. Menú → **Import** → pegá el contenido de `nodered/node-red-flow.json`.

### Configurar el Email (Gmail)
**Paso 1: Generar la App Password en Gmail**
1. Necesitás tener activada la verificación en dos pasos en tu cuenta de Google (si no la tenés, activala primero en https://myaccount.google.com/security)
2. Ir a https://myaccount.google.com/apppasswords
3. Te pide un nombre cualquiera (ej: "Sistema ToF NodeRED") → Crear
4. Te da una contraseña de 16 caracteres tipo `abcd efgh ijkl mnop` — copiala.

**Paso 2: Ponerla en Node-RED**
1. En el flujo que importaste, hacé doble clic en el nodo final llamado **"Gmail Alertas"**.
2. En **Userid** poné tu Gmail completo.
3. En **Password** pegá la contraseña de 16 caracteres (sin espacios funciona igual).
4. Click en **Done**.
5. Finalmente, hacé click en el botón rojo **Deploy** (arriba a la derecha).

---

## 4. Levantar el frontend

En una terminal nueva, entrá a la carpeta `frontend`:

```bash
cd frontend
npm install
npm run dev
```

El panel web queda disponible en `http://localhost:5173`.

Credenciales de acceso:

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Usuario | `usuario` | `user123` |

---

## 5. Simular el ESP32 en Wokwi

### 5.1 Crear el proyecto
1. Ir a [wokwi.com](https://wokwi.com) → **New Project** → elegir **ESP32**
2. Se abre el editor con un `sketch.ino` vacío y un `diagram.json` por defecto

### 5.2 Cargar el código
* **Pestaña `sketch.ino`:** borrá todo el contenido y pegá el contenido de `sketch_v2.ino`
* **Pestaña `diagram.json`:** hacé clic en el ícono de la flecha (▼) al lado del nombre del archivo → **Edit diagram.json** → reemplazá todo con el contenido de `diagram.json`

### 5.3 Agregar las librerías
1. Clic en el ícono de la biblioteca (📚) en el panel izquierdo
2. Buscar `PubSubClient` → instalar
3. Buscar `ArduinoJson` → instalar

### 5.4 Correr la simulación
Clic en el botón **▶ Start Simulation**. En el monitor serie deberías ver:

```text
[WiFi] Conectando......
[WiFi] Conectado.
[MQTT] Conectando... OK
[ToF] Distancia: 350 mm
```

---

## 6. Verificar que toda la arquitectura se comunica

Con la simulación corriendo, Node-RED activado y el frontend levantado:

1. Abrí el panel web en `http://localhost:5173`.
2. Iniciá sesión con `admin` / `admin123`.
3. Hacé clic sobre el sensor **HC-SR04** en Wokwi.
4. Bajá el slider de **Distance** por debajo de **200 mm**.
5. Ocurrirá la magia de la orquestación:
   - El ESP32 hace sonar su buzzer localmente y publica el dato bruto.
   - Node-RED recibe el dato por MQTT, evalúa que es menor a 200mm, **te envía el email** (limitado a 1 cada 30 segs) y hace un POST al Backend.
   - El Backend lo guarda en SQLite.
   - Tu frontend en React se actualiza en tiempo real mostrando la alerta en rojo.

---

## 7. Comandos útiles

```bash
# Levantar todo
docker compose up -d

# Detener todo
docker compose down

# Ver logs en vivo (Backend)
docker compose logs -f backend

# Ver logs en vivo (Node-RED)
docker compose logs -f node-red

# Reiniciar backend o nodered
docker compose restart backend
docker compose restart node-red

# Ver la base de datos SQLite
docker compose exec backend node -e "
  const db = require('better-sqlite3')('tof.db');
  console.log(db.prepare('SELECT * FROM lecturas ORDER BY id DESC LIMIT 5').all());
"
```

---

## 8. Problemas comunes

* **Los datos no aparecen en el frontend (Dashboard de React)**
Ahora el flujo es `ESP32 -> MQTT -> Node-RED -> Backend`. Si falta un dato, verificá que apretaste el botón **Deploy** en Node-RED, ya que es él quien empuja los datos a la base de datos a través del puerto 3001.
* **El ESP32 en Wokwi no se conecta a WiFi**
El SSID tiene que ser exactamente `Wokwi-GUEST` con contraseña vacía. Verificalo en las primeras líneas de `sketch_v2.ino`.
* **Los correos no llegan**
Revisá la pestaña "Debug" en Node-RED (el ícono del bichito a la derecha). Si hay un error de autenticación, asegurate de no haber usado tu clave normal de Gmail en el nodo, sino la de Aplicación generada en Google. Recordá también el filtro antispam: si Node-RED mandó un mail, bloqueará los envíos por 30 segundos antes de dejar pasar el siguiente.
* **El botón de Excel/PDF no descarga nada**
El token JWT vence a las 8 horas. Cerrá sesión, volvé a entrar y reintentá.
