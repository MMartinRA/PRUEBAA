Sistema ToF (HC-SR04) — Guía de configuraciónRequisitos previosDocker Desktop instalado y corriendoNode.js 18+ instaladoCuenta en wokwi.com (gratis)1. Descargar el proyectoDescomprimí el archivo tof-sistema-completo.zip. Vas a tener esta estructura:tof-sistema/
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
2. Levantar la infraestructura con DockerDesde la carpeta raíz del proyecto:Bashdocker compose up -d
Esto levanta:Backend (API) en http://localhost:3001Node-RED (Orquestador) en http://localhost:1880Para verificar que están corriendo:Bashdocker compose ps
La primera vez tarda un par de minutos porque instala las dependencias de Node dentro del contenedor.3. Configurar Node-RED y el Email de Alertas (¡Importante!)Como ahora Node-RED es el orquestador, debe estar configurado para que los datos lleguen al backend y se envíen los mails.Abrí http://localhost:1880 en tu navegador.Menú (☰ arriba a la derecha) → Manage palette → pestaña Install.Buscá e instalá estas dos librerías:node-red-dashboardnode-red-node-emailMenú → Import → pegá el contenido de nodered/node-red-flow.json.Configurar el Email (Gmail)Paso 1: Generar la App Password en GmailNecesitás tener activada la verificación en dos pasos en tu cuenta de Google (si no la tenés, activala primero en https://myaccount.google.com/security)Ir a https://myaccount.google.com/apppasswordsTe pide un nombre cualquiera (ej: "Sistema ToF NodeRED") → CrearTe da una contraseña de 16 caracteres tipo abcd efgh ijkl mnop — copiala.Paso 2: Ponerla en Node-REDEn el flujo que importaste, hacé doble clic en el nodo final llamado "Gmail Alertas".En Userid poné tu Gmail completo.En Password pegá la contraseña de 16 caracteres (sin espacios funciona igual).Click en Done.Finalmente, hacé click en el botón rojo Deploy (arriba a la derecha).4. Levantar el frontendEn una terminal nueva, entrá a la carpeta frontend:Bashcd frontend
npm install
npm run dev
El panel web queda disponible en http://localhost:5173.Credenciales de acceso:RolUsuarioContraseñaAdministradoradminadmin123Usuariousuariouser1235. Simular el ESP32 en Wokwi5.1 Crear el proyectoIr a wokwi.com → New Project → elegir ESP32Se abre el editor con un sketch.ino vacío y un diagram.json por defecto5.2 Cargar el códigoPestaña sketch.ino: borrá todo el contenido y pegá el contenido de sketch_v2.inoPestaña diagram.json: hacé clic en el ícono de la flecha (▼) al lado del nombre del archivo → Edit diagram.json → reemplazá todo con el contenido de diagram.json5.3 Agregar las libreríasClic en el ícono de la biblioteca (📚) en el panel izquierdoBuscar PubSubClient → instalarBuscar ArduinoJson → instalar5.4 Correr la simulaciónClic en el botón ▶ Start Simulation. En el monitor serie deberías ver:[WiFi] Conectando......
[WiFi] Conectado.
[MQTT] Conectando... OK
[ToF] Distancia: 350 mm
6. Verificar que toda la arquitectura se comunicaCon la simulación corriendo, Node-RED activado y el frontend levantado:Abrí el panel web en http://localhost:5173.Iniciá sesión con admin / admin123.Hacé clic sobre el sensor HC-SR04 en Wokwi.Bajá el slider de Distance por debajo de 200 mm.Ocurrirá la magia de la orquestación:El ESP32 hace sonar su buzzer localmente y publica el dato bruto.Node-RED recibe el dato por MQTT, evalúa que es menor a 200mm, te envía el email (limitado a 1 cada 30 segs) y hace un POST al Backend.El Backend lo guarda en SQLite.Tu frontend en React se actualiza en tiempo real mostrando la alerta en rojo.7. Comandos útilesBash# Levantar todo
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
8. Problemas comunesLos datos no aparecen en el frontend (Dashboard de React)Ahora el flujo es ESP32 -> MQTT -> Node-RED -> Backend. Si falta un dato, verificá que apretaste el botón Deploy en Node-RED, ya que es él quien empuja los datos a la base de datos a través del puerto 3001.El ESP32 en Wokwi no se conecta a WiFiEl SSID tiene que ser exactamente Wokwi-GUEST con contraseña vacía. Verificalo en las primeras líneas de sketch_v2.ino.Los correos no lleganRevisá la pestaña "Debug" en Node-RED (el ícono del bichito a la derecha). Si hay un error de autenticación, asegurate de no haber usado tu clave normal de Gmail en el nodo, sino la de Aplicación generada en Google. Recordá también el filtro antispam: si Node-RED mandó un mail, bloqueará los envíos por 30 segundos antes de dejar pasar el siguiente.El botón de Excel/PDF no descarga nadaEl token JWT vence a las 8 horas. Cerrá sesión, volvé a entrar y reintentá.
