/*
  ====================================================================
  Sistema HC-SR04 - ESP32 Firmware 
  Trabajo Final · ARQUITECTURA AVANZADA / COMPLEJIDAD ALGORÍTMICA
  Universidad CAECE · Mar del Plata
  ====================================================================
  Hardware SIMULADO: ESP32 + HC-SR04 
  ====================================================================
  Tópicos MQTT:
    PUBLICA  caece/tof/distancia   -> valor numérico en mm
    PUBLICA  caece/tof/evento      -> JSON con tipo ALERTA/OK
    SUSCRIBE caece/tof/config      -> JSON con nueva config
    SUSCRIBE caece/tof/cmd         -> JSON con {activo: bool}
    SUSCRIBE caece/tof/buzzer      -> "auto" | "manual" | "off" | "SILENCIAR"
  ====================================================================
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------
// Pines
// ---------------------------------------------------------------
const int TRIG_PIN   = 5;
const int ECHO_PIN   = 18;
const int LED_PIN    = 2;
const int BUZZER_PIN = 4;

// ---------------------------------------------------------------
// Parámetros configurables (se actualizan vía MQTT)
// ---------------------------------------------------------------
int  umbralMM      = 200;
int  muestreoSegS  = 1;
bool sistemaActivo = true;
char sistemaID[32] = "SENSOR-01";

// ---------------------------------------------------------------
// WiFi / MQTT
// ---------------------------------------------------------------
const char* WIFI_SSID   = "Wokwi-GUEST";
const char* WIFI_PASS   = "";
const char* MQTT_BROKER = "test.mosquitto.org";
const int   MQTT_PORT   = 1883;
const char* MQTT_CLIENT = "esp32-tof-caece-v2";

const char* TOPIC_DIST   = "caece/tof/distancia";
const char* TOPIC_EVENTO = "caece/tof/evento";
const char* TOPIC_CONFIG = "caece/tof/config";
const char* TOPIC_CMD    = "caece/tof/cmd";
const char* TOPIC_BUZZER = "caece/tof/buzzer";

WiFiClient   espClient;
PubSubClient mqttClient(espClient);

// ---------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------
bool alarmaActiva          = false;
bool buzzerSilenciadoManual = false;
char buzzerModo[8]         = "auto"; // "auto" | "manual" | "off"
unsigned long ultimaLect   = 0;

// ================================================================
// SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);

  conectarWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMQTTMessage);
}

// ================================================================
// LOOP
// ================================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();
  if (!mqttClient.connected())        conectarMQTT();
  mqttClient.loop();

  if (!sistemaActivo) {
    digitalWrite(LED_PIN, LOW);
    noTone(BUZZER_PIN);
    delay(500);
    return;
  }

  unsigned long ahora   = millis();
  long intervaloMs      = (long)muestreoSegS * 1000;

  if (ahora - ultimaLect >= intervaloMs) {
    ultimaLect = ahora;
    long dist = leerDistanciaMM();
    if (dist > 0) procesarDistancia(dist);
  }
}

// ================================================================
// Lectura de distancia — HC-SR04 (simulación Wokwi)
// ================================================================
long leerDistanciaMM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long durUS = pulseIn(ECHO_PIN, HIGH, 30000);
  if (durUS == 0) return -1;
  return (durUS * 343L) / 2000;
}

// ================================================================
// Procesar distancia: acciones locales + MQTT
// ================================================================
void procesarDistancia(long distMM) {
  Serial.print("[ToF] Distancia: ");
  Serial.print(distMM);
  Serial.println(" mm");

  bool dentroUmbral = (distMM <= umbralMM);

  // LED siempre refleja la alarma
  digitalWrite(LED_PIN, dentroUmbral ? HIGH : LOW);

  // Lógica del buzzer según modo
  if (strcmp(buzzerModo, "off") == 0) {
    // Siempre silenciado
    noTone(BUZZER_PIN);

  } else if (strcmp(buzzerModo, "auto") == 0) {
    // Suena mientras haya alerta, se apaga solo al salir del umbral
    if (dentroUmbral) {
      tone(BUZZER_PIN, 1000);
    } else {
      noTone(BUZZER_PIN);
      buzzerSilenciadoManual = false;
    }

  } else if (strcmp(buzzerModo, "manual") == 0) {
    // Suena al entrar en alerta, solo se apaga con comando SILENCIAR
    if (dentroUmbral && !buzzerSilenciadoManual) {
      tone(BUZZER_PIN, 1000);
    } else if (!dentroUmbral) {
      // Al salir del umbral se resetea el silencio manual
      // para que suene de nuevo en la próxima alerta
      buzzerSilenciadoManual = false;
      noTone(BUZZER_PIN);
    }
  }

  // Telemetría
  publicarDistancia(distMM);

  // Eventos (solo en transición de estado)
  if (dentroUmbral && !alarmaActiva) {
    alarmaActiva = true;
    publicarEvento("ALERTA", distMM);
  } else if (!dentroUmbral && alarmaActiva) {
    alarmaActiva = false;
    publicarEvento("OK", distMM);
  }
}

// ================================================================
// Callback MQTT
// ================================================================
void onMQTTMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);
  char buf[256] = {0};
  memcpy(buf, payload, min((unsigned int)255, length));

  Serial.print("[MQTT IN] ");
  Serial.print(topicStr);
  Serial.print(" -> ");
  Serial.println(buf);

  // ---- Buzzer: comandos de texto plano ----
  if (topicStr == TOPIC_BUZZER) {
    String cmd = String(buf);
    cmd.trim();

    if (cmd == "off") {
      strlcpy(buzzerModo, "off", sizeof(buzzerModo));
      noTone(BUZZER_PIN);
    } else if (cmd == "auto") {
      strlcpy(buzzerModo, "auto", sizeof(buzzerModo));
      buzzerSilenciadoManual = false;
    } else if (cmd == "manual") {
      strlcpy(buzzerModo, "manual", sizeof(buzzerModo));
      buzzerSilenciadoManual = false;
    } else if (cmd == "SILENCIAR") {
      // Silencio puntual dentro del modo manual
      buzzerSilenciadoManual = true;
      noTone(BUZZER_PIN);
    }

    Serial.printf("[BUZZER] Modo: %s | Silenciado: %s\n",
                  buzzerModo, buzzerSilenciadoManual ? "si" : "no");
    return;
  }

  // ---- Config y CMD: JSON ----
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, buf) != DeserializationError::Ok) return;

  if (topicStr == TOPIC_CONFIG) {
    if (doc.containsKey("umbral_mm"))         umbralMM     = doc["umbral_mm"];
    if (doc.containsKey("tiempo_muestreo_s")) muestreoSegS = doc["tiempo_muestreo_s"];
    if (doc.containsKey("sistema_id")) {
      strlcpy(sistemaID, doc["sistema_id"] | "SENSOR-01", sizeof(sistemaID));
    }
    Serial.printf("[CONFIG] umbral=%d mm, muestreo=%ds, id=%s\n",
                  umbralMM, muestreoSegS, sistemaID);
  }

  if (topicStr == TOPIC_CMD) {
    if (doc.containsKey("activo")) {
      sistemaActivo = doc["activo"];
      Serial.printf("[CMD] Sistema %s\n", sistemaActivo ? "ACTIVADO" : "DETENIDO");
    }
  }
}

// ================================================================
// WiFi
// ================================================================
void conectarWiFi() {
  Serial.print("[WiFi] Conectando");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 40) {
    delay(250); Serial.print("."); intentos++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED
    ? "\n[WiFi] Conectado. IP: " + WiFi.localIP().toString()
    : "\n[WiFi] Fallo (reintentará)");
}

// ================================================================
// MQTT: conectar + suscribir
// ================================================================
void conectarMQTT() {
  Serial.print("[MQTT] Conectando...");
  if (mqttClient.connect(MQTT_CLIENT)) {
    Serial.println(" OK");
    mqttClient.subscribe(TOPIC_CONFIG);
    mqttClient.subscribe(TOPIC_CMD);
    mqttClient.subscribe(TOPIC_BUZZER);
  } else {
    Serial.printf(" FALLO rc=%d\n", mqttClient.state());
  }
}

// ================================================================
// Publicaciones
// ================================================================
void publicarDistancia(long distMM) {
  char buf[16];
  snprintf(buf, sizeof(buf), "%ld", distMM);
  mqttClient.publish(TOPIC_DIST, buf);
}

void publicarEvento(const char* tipo, long distMM) {
  char buf[128];
  snprintf(buf, sizeof(buf),
    "{\"evento\":\"%s\",\"distancia_mm\":%ld,\"umbral_mm\":%d,\"sensor_id\":\"%s\"}",
    tipo, distMM, umbralMM, sistemaID);
  mqttClient.publish(TOPIC_EVENTO, buf);
  Serial.printf("[MQTT OUT] evento: %s\n", buf);
}
