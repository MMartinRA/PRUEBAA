/*
  ====================================================================
  Sistema ToF - ESP32 Firmware v2
  Trabajo Final · ARQUITECTURA AVANZADA / COMPLEJIDAD ALGORÍTMICA
  Universidad CAECE · Mar del Plata
  ====================================================================
  Hardware SIMULADO: ESP32 + HC-SR04 (sustituto de VL53L0X en Wokwi)
  Para pasar al VL53L0X real ver sección PORTABILIDAD al final.
  ====================================================================
  Tópicos MQTT:
    PUBLICA  caece/tof/distancia   -> valor numérico en mm
    PUBLICA  caece/tof/evento      -> JSON con tipo ALERTA/OK
    SUSCRIBE caece/tof/config      -> JSON con nueva config
    SUSCRIBE caece/tof/cmd         -> JSON con {activo: bool}
  ====================================================================
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>        // librería adicional: ArduinoJson

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
int   umbralMM       = 200;
int   muestreoSegS   = 1;
bool  sistemaActivo  = true;
char  sistemaID[32]  = "SENSOR-01";

// ---------------------------------------------------------------
// WiFi / MQTT
// ---------------------------------------------------------------
const char* WIFI_SSID    = "Wokwi-GUEST";
const char* WIFI_PASS    = "";
const char* MQTT_BROKER  = "test.mosquitto.org";
const int   MQTT_PORT    = 1883;
const char* MQTT_CLIENT  = "esp32-tof-caece-v2";

const char* TOPIC_DIST   = "caece/tof/distancia";
const char* TOPIC_EVENTO = "caece/tof/evento";
const char* TOPIC_CONFIG = "caece/tof/config";
const char* TOPIC_CMD    = "caece/tof/cmd";

WiFiClient   espClient;
PubSubClient mqttClient(espClient);

// ---------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------
bool alarmaActiva         = false;
unsigned long ultimaLect  = 0;
unsigned long ultimaPub   = 0;

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
  digitalWrite(BUZZER_PIN, LOW);

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

  // Solo medir si el sistema está activo
  if (!sistemaActivo) {
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    delay(500);
    return;
  }

  unsigned long ahora = millis();
  long intervaloMs    = (long)muestreoSegS * 1000;

  if (ahora - ultimaLect >= intervaloMs) {
    ultimaLect = ahora;

    long dist = leerDistanciaMM();
    if (dist > 0) {
      procesarDistancia(dist);
    }
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

  // ---- Acciones locales ----
  digitalWrite(LED_PIN,    dentroUmbral ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, dentroUmbral ? HIGH : LOW);

  // ---- Telemetría periódica ----
  publicarDistancia(distMM);

  // ---- Eventos (solo en transición de estado) ----
  if (dentroUmbral && !alarmaActiva) {
    alarmaActiva = true;
    publicarEvento("ALERTA", distMM);
  } else if (!dentroUmbral && alarmaActiva) {
    alarmaActiva = false;
    publicarEvento("OK", distMM);
  }
}

// ================================================================
// Callback MQTT: recibe config y comandos desde el backend
// ================================================================
void onMQTTMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);
  char buf[256] = {0};
  memcpy(buf, payload, min((unsigned int)255, length));

  Serial.print("[MQTT IN] ");
  Serial.print(topicStr);
  Serial.print(" -> ");
  Serial.println(buf);

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, buf) != DeserializationError::Ok) return;

  if (topicStr == TOPIC_CONFIG) {
    if (doc.containsKey("umbral_mm"))         umbralMM      = doc["umbral_mm"];
    if (doc.containsKey("tiempo_muestreo_s")) muestreoSegS  = doc["tiempo_muestreo_s"];
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

/*
  ====================================================================
  PORTABILIDAD A VL53L0X REAL
  ====================================================================
  1) Agregar librerías:
       #include <Wire.h>
       #include <Adafruit_VL53L0X.h>

  2) Declarar objeto:
       Adafruit_VL53L0X sensorTof;

  3) En setup(), reemplazar config de TRIG/ECHO por:
       Wire.begin();
       sensorTof.begin();

  4) Reemplazar cuerpo de leerDistanciaMM():
       VL53L0X_RangingMeasurementData_t medida;
       sensorTof.rangingTest(&medida, false);
       return (medida.RangeStatus != 4) ? medida.RangeMilliMeter : -1;

  Todo lo demás (loop, MQTT, config remota) permanece igual.
  ====================================================================
*/
