/**
 * libre-logger.js
 *
 * Se queda corriendo en segundo plano (no termina solo) y, cada minuto,
 * pide tu lectura ACTUAL de glucosa a LibreLinkUp y la añade a un CSV
 * local ("glucosa.csv"). Así construyes tú mismo un histórico a
 * resolución de 1 minuto, que es más fino que los 15 min que guarda
 * el propio sensor.
 *
 * Requisitos: Node.js 18+
 *
 * Uso:
 *   LIBRE_EMAIL="tu@email.com" LIBRE_PASSWORD="tu_contraseña" node libre-logger.js
 *
 * Déjalo corriendo en una terminal (o con pm2 / nohup / screen si quieres
 * que sobreviva al cerrar la terminal). Párale con Ctrl+C.
 *
 * Cada línea añadida al CSV: timestamp_iso,valor_mgdl,tendencia
 */

const fs = require("fs");

const EMAIL = process.env.LIBRE_EMAIL;
const PASSWORD = process.env.LIBRE_PASSWORD;
const CSV_PATH = "glucosa.csv";
const INTERVAL_MS = 60 * 1000; // 1 minuto

if (!EMAIL || !PASSWORD) {
  console.error(
    "Faltan credenciales.\n" +
    "Uso:\n" +
    '  LIBRE_EMAIL="tu@email.com" LIBRE_PASSWORD="tu_contraseña" node libre-logger.js'
  );
  process.exit(1);
}

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "product": "llu.android",
  "version": "4.16.0",
};

let baseUrl = "https://api.libreview.io";
let token = null;
let patientId = null;

async function login() {
  const res = await fetch(`${baseUrl}/llu/auth/login`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();

  if (data?.data?.redirect && data?.data?.region) {
    baseUrl = `https://api-${data.data.region}.libreview.io`;
    return login();
  }

  const t = data?.data?.authTicket?.token;
  if (!t) throw new Error("Login fallido: " + JSON.stringify(data));
  return t;
}

async function getCurrentReading() {
  const res = await fetch(`${baseUrl}/llu/connections`, {
    headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (res.status === 401) {
    // token caducado, reloguea
    token = await login();
    return getCurrentReading();
  }

  const patient = data?.data?.[0];
  if (!patient) throw new Error("Sin conexiones: " + JSON.stringify(data));
  patientId = patient.patientId;

  const gm = patient.glucoseMeasurement;
  if (!gm) throw new Error("Sin lectura actual: " + JSON.stringify(patient));

  return {
    time: gm.Timestamp,
    value: gm.Value,
    trend: gm.TrendArrow,
  };
}

function ensureCsvHeader() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, "timestamp,value_mgdl,trend\n", "utf-8");
  }
}

function appendReading(r) {
  const line = `${r.time},${r.value},${r.trend}\n`;
  fs.appendFileSync(CSV_PATH, line, "utf-8");
}

let lastTimestamp = null;

async function tick() {
  try {
    const r = await getCurrentReading();
    if (r.time === lastTimestamp) {
      console.log(`[${new Date().toISOString()}] Sin lectura nueva todavía (${r.value} mg/dL, misma marca de tiempo).`);
      return;
    }
    lastTimestamp = r.time;
    appendReading(r);
    console.log(`[${new Date().toISOString()}] Guardado: ${r.value} mg/dL (${r.trend}) @ ${r.time}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
  }
}

(async () => {
  console.log("Iniciando sesión en Abbott...");
  token = await login();
  ensureCsvHeader();
  console.log(`Guardando lecturas en ${CSV_PATH} cada ${INTERVAL_MS / 1000}s. Ctrl+C para parar.`);

  await tick();
  setInterval(tick, INTERVAL_MS);
})();
