# Sistema ToF VL53L0X — Guía de configuración

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- [Node.js 18+](https://nodejs.org/) instalado
- Cuenta en [wokwi.com](https://wokwi.com) (gratis)

---

## 1. Descargar el proyecto

Descomprimí el archivo `tof-sistema-completo.zip`. Vas a tener esta estructura:

```
tof-sistema/
├── sketch_v2.ino          ← firmware del ESP32
├── diagram.json           ← circuito para Wokwi
├── libraries.txt          ← librerías para Wokwi
├── docker-compose.yml
├── backend/
│   ├── server.js
│   └── package.json
└── frontend/
    ├── src/App.jsx
    └── package.json
```

---

## 2. Levantar el backend con Docker

Desde la carpeta raíz del proyecto:

```bash
docker compose up -d
```

Esto levanta:
- **Backend** en `http://localhost:3001`
- **Node-RED** en `http://localhost:1880`

Para verificar que están corriendo:

```bash
docker compose ps
```

> La primera vez tarda un par de minutos porque instala las dependencias de Node dentro del contenedor.

---

## 3. Levantar el frontend

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

## 4. Simular el ESP32 en Wokwi

### 4.1 Crear el proyecto

1. Ir a [wokwi.com](https://wokwi.com) → **New Project** → elegir **ESP32**
2. Se abre el editor con un `sketch.ino` vacío y un `diagram.json` por defecto

### 4.2 Cargar el código

**Pestaña `sketch.ino`:** borrá todo el contenido y pegá el contenido de `sketch_v2.ino`

**Pestaña `diagram.json`:** hacé clic en el ícono de la flecha (▼) al lado del nombre del archivo → **Edit diagram.json** → reemplazá todo con el contenido de `diagram.json`

### 4.3 Agregar las librerías

1. Clic en el ícono de la biblioteca (📚) en el panel izquierdo
2. Buscar `PubSubClient` → instalar
3. Buscar `ArduinoJson` → instalar

### 4.4 Correr la simulación

Clic en el botón **▶ Start Simulation**.

En el monitor serie (parte inferior) deberías ver:

```
[WiFi] Conectando......
[WiFi] Conectado. IP: 10.0.0.2
[MQTT] Conectando... OK
[ToF] Distancia: 350 mm
[ToF] Distancia: 350 mm
```

### 4.5 Simular detecciones

1. Hacé clic sobre el sensor **HC-SR04** en el diagrama
2. Aparece un slider de **Distance**
3. Bajalo por debajo de **200 mm** → el LED se enciende, el buzzer suena y se publica una ALERTA

---

## 5. Verificar que todo se comunica

Con la simulación corriendo y el backend levantado:

1. Abrí el panel web en `http://localhost:5173`
2. Iniciá sesión con `admin` / `admin123`
3. En el **Dashboard** deberías ver la distancia actualizándose en tiempo real
4. Bajá el slider del sensor → el gauge debería reflejar la alerta

Si los datos no llegan, verificá que el backend esté conectado al broker:

```bash
docker compose logs backend | grep MQTT
```

Debería decir `[MQTT] Conectado a test.mosquitto.org`.

---

## 6. Configurar el email de alertas (opcional)

Paso 1: Generar la App Password en Gmail

Necesitás tener activada la verificación en dos pasos en tu cuenta de Google (si no la tenés, activala primero en https://myaccount.google.com/security)
Ir a https://myaccount.google.com/apppasswords
Te pide un nombre cualquiera (ej: "Sistema ToF") → Crear
Te da una contraseña de 16 caracteres tipo abcd efgh ijkl mnop — copiala (sin espacios funciona igual)

Por defecto el email está configurado con **Gmail** (bandeja de pruebas). Para probarlo:

1. Necesitás tener activada la verificación en dos pasos en tu cuenta de Google (si no la tenés, activala primero en https://myaccount.google.com/security)
2. Ir a https://myaccount.google.com/apppasswords
3. Te pide un nombre cualquiera (ej: "Sistema ToF") → Crear
4. Te da una contraseña de 16 caracteres tipo abcd efgh ijkl mnop — copiala (sin espacios funciona igual)
5. Cambiarla en server.js :

```js
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'Tu_Gmail',     // tu Gmail
    pass: 'Tu_Password'          // App Password de 16 caracteres (sin espacios)
  }
});
```

4. Reiniciá el backend:

```bash
docker compose restart backend
```

5. Desde el panel web (con rol admin) → **Configuración** → cambiá el email de alertas por el que quieras recibir en el que configuraste

La próxima vez que el sensor detecte un objeto, el email llega a la bandeja del mail configurado en Gmail.

---

## 7. Importar el flujo de Node-RED

1. Abrí `http://localhost:1880`
2. Menú (☰ arriba a la derecha) → **Manage palette** → pestaña **Install**
3. Buscá `node-red-dashboard` e instalalo
4. Menú → **Import** → pegá el contenido de `nodered/node-red-flow.json`
5. Click en **Deploy**

El dashboard de Node-RED queda en `http://localhost:1880/ui`.

---

## 8. Comandos útiles

```bash
# Levantar todo
docker compose up -d

# Detener todo
docker compose down

# Ver logs en vivo
docker compose logs -f

# Reiniciar solo el backend
docker compose restart backend

# Ver la base de datos SQLite
docker compose exec backend node -e "
  const db = require('better-sqlite3')('tof.db');
  console.log(db.prepare('SELECT * FROM lecturas ORDER BY id DESC LIMIT 5').all());
"
```

---

## 9. Problemas comunes

**El frontend no conecta con el backend**
Verificá que el backend esté corriendo en el puerto 3001: `docker compose ps`. Si dice `Exit`, revisá los logs con `docker compose logs backend`.

**El ESP32 en Wokwi no se conecta a WiFi**
El SSID tiene que ser exactamente `Wokwi-GUEST` con contraseña vacía. Verificalo en las primeras líneas de `sketch_v2.ino`.

**Los datos no aparecen en el dashboard**
El broker `test.mosquitto.org` es público y gratuito; a veces tiene latencia. Esperá unos segundos. Si persiste, verificá que el `MQTT_CLIENT` en el sketch no esté en uso por otra instancia (cambiá `esp32-tof-caece-v2` por cualquier string único).

**El botón de Excel/PDF no descarga nada**
El token JWT vence a las 8 horas. Cerrá sesión, volvé a entrar y reintentá.
