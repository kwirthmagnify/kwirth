// tests/file.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import fs2 from "fs";
import os from "os";
import path2 from "path";

// src/back/index.ts
import fs from "fs";
import path from "path";
var FileSender = class {
  constructor() {
    this.id = "file";
    this.senderType = "output";
    this.configs = /* @__PURE__ */ new Map();
    this.lineCounts = /* @__PURE__ */ new Map();
  }
  getNodeMeta() {
    return { label: "File", icon: "Description" };
  }
  // configName -> current line count
  addConfig(config) {
    const fc = config;
    this.configs.set(fc.name, fc);
    const resolved = path.resolve(fc.filePath);
    if (fs.existsSync(resolved)) {
      try {
        const content = fs.readFileSync(resolved, "utf-8");
        this.lineCounts.set(fc.name, content.split("\n").length - 1);
      } catch {
        this.lineCounts.set(fc.name, 0);
      }
    } else {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      this.lineCounts.set(fc.name, 0);
    }
  }
  removeConfig(name) {
    this.configs.delete(name);
    this.lineCounts.delete(name);
  }
  hasConfig(name) {
    return this.configs.has(name);
  }
  getConfigNames() {
    return Array.from(this.configs.keys());
  }
  /**
   * One formatted line. Shared by send() and sendBatch() so both write exactly the same thing —
   * a batch is a performance detail, not a different format.
   */
  formatLine(config, message) {
    const useTimestamps = config.timestamps ?? true;
    const useLevels = config.levels ?? true;
    const cuando = message.origin?.timestamp ? new Date(message.origin.timestamp) : /* @__PURE__ */ new Date();
    const ts = useTimestamps ? `[${cuando.toISOString()}] ` : "";
    const level = message.level ?? "info";
    const lvTag = useLevels ? `[${level.toUpperCase()}] ` : "";
    const subject = message.subject ? `${message.subject}: ` : "";
    const to = message.to ? ` \u2192 ${Array.isArray(message.to) ? message.to.join(", ") : message.to}` : "";
    let origin = "";
    if ((config.origin ?? false) && message.origin) {
      const o = message.origin;
      const partes = [o.namespace, o.pod, o.container].filter(Boolean).join("/");
      const etiqueta = partes || o.service || "";
      if (etiqueta) origin = `[${etiqueta}] `;
    }
    return `${ts}${lvTag}${origin}${subject}${message.body}${to}
`;
  }
  /** Rotates when maxLines is set and exceeded, counting how many lines are about to be written. */
  rotateIfNeeded(configName, config, resolved, incoming) {
    const maxLines = config.maxLines ?? 0;
    const lineCount = this.lineCounts.get(configName) ?? 0;
    if (maxLines > 0 && lineCount + incoming > maxLines) {
      const rotated = `${resolved}.${Date.now()}.bak`;
      try {
        fs.renameSync(resolved, rotated);
      } catch {
      }
      this.lineCounts.set(configName, 0);
    }
  }
  async send(configName, message) {
    const config = this.configs.get(configName);
    if (!config) throw new Error(`FileSender: config '${configName}' not found`);
    const resolved = path.resolve(config.filePath);
    this.rotateIfNeeded(configName, config, resolved, 1);
    fs.appendFileSync(resolved, this.formatLine(config, message), "utf-8");
    this.lineCounts.set(configName, (this.lineCounts.get(configName) ?? 0) + 1);
  }
  /**
   * A whole batch in ONE write.
   *
   * This is what `sendBatch` is for: a log forwarder hands over a hundred lines at a time, and doing
   * a syscall per line turns a cheap append into the slowest part of the pipeline. The format is
   * identical to send()'s, so a file written either way reads the same.
   */
  async sendBatch(configName, messages) {
    const config = this.configs.get(configName);
    if (!config) throw new Error(`FileSender: config '${configName}' not found`);
    if (messages.length === 0) return;
    const resolved = path.resolve(config.filePath);
    this.rotateIfNeeded(configName, config, resolved, messages.length);
    const bloque = messages.map((m) => this.formatLine(config, m)).join("");
    fs.appendFileSync(resolved, bloque, "utf-8");
    this.lineCounts.set(configName, (this.lineCounts.get(configName) ?? 0) + messages.length);
  }
  getConfigSchema() {
    return [
      { name: "name", label: "Name", required: true },
      { name: "filePath", label: "File path", required: true },
      /*
       * The defaults are DECLARED, not just applied further down: the dialog paints a switch from
       * the schema, so a field whose default is true but says nothing shows up as off while
       * behaving as on. What you see has to be what you get.
       */
      { name: "timestamps", label: "Timestamps", type: "boolean", default: true },
      { name: "levels", label: "Levels", type: "boolean", default: true },
      { name: "maxLines", label: "Max lines", type: "number" },
      { name: "origin", label: "Prefix each line with its origin", type: "boolean" }
    ];
  }
  async startSender(_senders) {
  }
  async stopSender() {
  }
};
var back_default = FileSender;

// tests/file.test.ts
var tmp = () => {
  const dir = fs2.mkdtempSync(path2.join(os.tmpdir(), "file-sender-"));
  return path2.join(dir, "salida.log");
};
var crea = async (config) => {
  const sender = new back_default();
  sender.addConfig(config);
  return sender;
};
var lee = (ruta) => fs2.existsSync(ruta) ? fs2.readFileSync(ruta, "utf-8").split("\n").filter((l) => l !== "") : [];
test("un lote se escribe entero y en orden", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false });
  await sender.sendBatch("c", [{ body: "primera" }, { body: "segunda" }, { body: "tercera" }]);
  assert.deepEqual(lee(ruta), ["primera", "segunda", "tercera"]);
});
test("el formato de un lote es el MISMO que el de una linea suelta", async () => {
  const rutaA = tmp(), rutaB = tmp();
  const suelto = await crea({ name: "a", filePath: rutaA, timestamps: false, levels: true });
  const lote = await crea({ name: "b", filePath: rutaB, timestamps: false, levels: true });
  await suelto.send("a", { body: "hola", level: "warn" });
  await lote.sendBatch("b", [{ body: "hola", level: "warn" }]);
  assert.deepEqual(lee(rutaA), lee(rutaB), "un lote es un detalle de rendimiento, no otro formato");
});
test("un lote vacio no crea ni toca el fichero", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta });
  await sender.sendBatch("c", []);
  assert.equal(fs2.existsSync(ruta), false);
});
test("el origen sale solo si la configuracion lo pide", async () => {
  const sinOrigen = tmp(), conOrigen = tmp();
  const a = await crea({ name: "a", filePath: sinOrigen, timestamps: false, levels: false });
  const b = await crea({ name: "b", filePath: conOrigen, timestamps: false, levels: false, origin: true });
  const mensaje = { body: "algo paso", origin: { namespace: "produccion", pod: "api-7", container: "api" } };
  await a.sendBatch("a", [mensaje]);
  await b.sendBatch("b", [mensaje]);
  assert.deepEqual(lee(sinOrigen), ["algo paso"], "por defecto, los ficheros de siempre no cambian de forma");
  assert.deepEqual(lee(conOrigen), ["[produccion/api-7/api] algo paso"]);
});
test("sin pod, el origen se identifica por su servicio", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false, origin: true });
  await sender.sendBatch("c", [{ body: "linea", origin: { service: "facturacion" } }]);
  assert.deepEqual(lee(ruta), ["[facturacion] linea"]);
});
test("un mensaje sin origen no deja corchetes vacios", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false, origin: true });
  await sender.sendBatch("c", [{ body: "sin origen" }]);
  assert.deepEqual(lee(ruta), ["sin origen"]);
});
test("la rotacion cuenta el lote ENTERO, no lo deja pasar por ser una sola escritura", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false, maxLines: 5 });
  await sender.sendBatch("c", [{ body: "1" }, { body: "2" }, { body: "3" }]);
  await sender.sendBatch("c", [{ body: "4" }, { body: "5" }, { body: "6" }]);
  assert.deepEqual(lee(ruta), ["4", "5", "6"]);
  const rotados = fs2.readdirSync(path2.dirname(ruta)).filter((f) => f.includes(".bak"));
  assert.equal(rotados.length, 1, "y lo anterior no se pierde: queda en el .bak");
});
test("sin maxLines no rota nunca", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false });
  for (let i = 0; i < 50; i++) await sender.sendBatch("c", [{ body: `linea ${i}` }]);
  assert.equal(lee(ruta).length, 50);
  assert.equal(fs2.readdirSync(path2.dirname(ruta)).filter((f) => f.includes(".bak")).length, 0);
});
test("una config que no existe se queja, en vez de escribir en cualquier sitio", async () => {
  const sender = await crea({ name: "c", filePath: tmp() });
  await assert.rejects(() => sender.sendBatch("la-que-no-es", [{ body: "x" }]));
});
test("send y sendBatch comparten el contador de lineas", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false, maxLines: 4 });
  await sender.send("c", { body: "a" });
  await sender.send("c", { body: "b" });
  await sender.sendBatch("c", [{ body: "c" }, { body: "d" }, { body: "e" }]);
  assert.deepEqual(lee(ruta), ["c", "d", "e"]);
});
test("cada linea lleva SU hora, no la del momento en que se escribio el lote", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: true, levels: false });
  await sender.sendBatch("c", [
    { body: "antes", origin: { timestamp: Date.parse("2026-09-23T08:00:00.000Z") } },
    { body: "despues", origin: { timestamp: Date.parse("2026-09-23T08:00:05.000Z") } }
  ]);
  const lineas = lee(ruta);
  assert.ok(lineas[0].startsWith("[2026-09-23T08:00:00.000Z]"), lineas[0]);
  assert.ok(lineas[1].startsWith("[2026-09-23T08:00:05.000Z]"), lineas[1]);
});
test("sin hora propia se usa la de escritura: una linea sin fecha sigue siendo una linea", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: true, levels: false });
  await sender.sendBatch("c", [{ body: "sin hora" }]);
  assert.match(lee(ruta)[0], /^\[\d{4}-\d{2}-\d{2}T/);
});
test("levels apagado EXPLICITAMENTE no pinta el nivel", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false, levels: false });
  await sender.sendBatch("c", [{ body: "sin nivel", level: "warn" }]);
  assert.deepEqual(lee(ruta), ["sin nivel"]);
});
test("sin decir nada sobre levels, se pinta: es el defecto declarado en el esquema", async () => {
  const ruta = tmp();
  const sender = await crea({ name: "c", filePath: ruta, timestamps: false });
  await sender.sendBatch("c", [{ body: "con nivel", level: "warn" }]);
  assert.deepEqual(lee(ruta), ["[WARN] con nivel"]);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vZmlsZS50ZXN0LnRzIiwgIi4uLy4uL3NyYy9iYWNrL2luZGV4LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCdcbmltcG9ydCBmcyBmcm9tICdmcydcbmltcG9ydCBvcyBmcm9tICdvcydcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnXG5pbXBvcnQgRmlsZVNlbmRlciBmcm9tICcuLi9zcmMvYmFjay9pbmRleCdcblxuLypcbiAgICBFbCBzZW5kZXIgYGZpbGVgLCB5IHNvYnJlIHRvZG8gc3UgZW50cmVnYSBwb3IgTE9URVMuXG5cbiAgICBFc2NyaWJpciBlbiB1biBmaWNoZXJvIHBhcmVjZSBsbyBtYXMgc2ltcGxlIHF1ZSBoYXksIHkgcG9yIGVzbyBlcyBkb25kZSBuYWRpZSBtaXJhOiBsYSByb3RhY2lvblxuICAgIGN1YW5kbyB1biBsb3RlIGNydXphIGVsIGxpbWl0ZSwgcXVlIGVsIGZvcm1hdG8gZGUgdW4gbG90ZSBzZWEgZWwgTUlTTU8gcXVlIGVsIGRlIHVuYSBsaW5lYSBzdWVsdGEsIHlcbiAgICBxdWUgZWwgb3JpZ2VuIGFwYXJlemNhIHNvbG8gc2kgc2UgcGlkZS4gTG9zIHRyZXMgc2Ugcm9tcGVuIGVuIHNpbGVuY2lvIFx1MjAxNCBlbCBmaWNoZXJvIHNpZ3VlIHRlbmllbmRvXG4gICAgbGluZWFzLCBzb2xvIHF1ZSBtYWwuXG4qL1xuXG5jb25zdCB0bXAgPSAoKTogc3RyaW5nID0+IHtcbiAgICBjb25zdCBkaXIgPSBmcy5ta2R0ZW1wU3luYyhwYXRoLmpvaW4ob3MudG1wZGlyKCksICdmaWxlLXNlbmRlci0nKSlcbiAgICByZXR1cm4gcGF0aC5qb2luKGRpciwgJ3NhbGlkYS5sb2cnKVxufVxuXG5jb25zdCBjcmVhID0gYXN5bmMgKGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgICBjb25zdCBzZW5kZXIgPSBuZXcgRmlsZVNlbmRlcigpXG4gICAgc2VuZGVyLmFkZENvbmZpZyhjb25maWcgYXMgbmV2ZXIpXG4gICAgcmV0dXJuIHNlbmRlclxufVxuXG5jb25zdCBsZWUgPSAocnV0YTogc3RyaW5nKTogc3RyaW5nW10gPT5cbiAgICBmcy5leGlzdHNTeW5jKHJ1dGEpID8gZnMucmVhZEZpbGVTeW5jKHJ1dGEsICd1dGYtOCcpLnNwbGl0KCdcXG4nKS5maWx0ZXIobCA9PiBsICE9PSAnJykgOiBbXVxuXG50ZXN0KCd1biBsb3RlIHNlIGVzY3JpYmUgZW50ZXJvIHkgZW4gb3JkZW4nLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YSA9IHRtcCgpXG4gICAgY29uc3Qgc2VuZGVyID0gYXdhaXQgY3JlYSh7IG5hbWU6ICdjJywgZmlsZVBhdGg6IHJ1dGEsIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IGZhbHNlIH0pXG5cbiAgICBhd2FpdCBzZW5kZXIuc2VuZEJhdGNoISgnYycsIFt7IGJvZHk6ICdwcmltZXJhJyB9LCB7IGJvZHk6ICdzZWd1bmRhJyB9LCB7IGJvZHk6ICd0ZXJjZXJhJyB9XSlcblxuICAgIGFzc2VydC5kZWVwRXF1YWwobGVlKHJ1dGEpLCBbJ3ByaW1lcmEnLCAnc2VndW5kYScsICd0ZXJjZXJhJ10pXG59KVxuXG50ZXN0KCdlbCBmb3JtYXRvIGRlIHVuIGxvdGUgZXMgZWwgTUlTTU8gcXVlIGVsIGRlIHVuYSBsaW5lYSBzdWVsdGEnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YUEgPSB0bXAoKSwgcnV0YUIgPSB0bXAoKVxuICAgIGNvbnN0IHN1ZWx0byA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYScsIGZpbGVQYXRoOiBydXRhQSwgdGltZXN0YW1wczogZmFsc2UsIGxldmVsczogdHJ1ZSB9KVxuICAgIGNvbnN0IGxvdGUgPSBhd2FpdCBjcmVhKHsgbmFtZTogJ2InLCBmaWxlUGF0aDogcnV0YUIsIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IHRydWUgfSlcblxuICAgIGF3YWl0IHN1ZWx0by5zZW5kKCdhJywgeyBib2R5OiAnaG9sYScsIGxldmVsOiAnd2FybicgfSlcbiAgICBhd2FpdCBsb3RlLnNlbmRCYXRjaCEoJ2InLCBbeyBib2R5OiAnaG9sYScsIGxldmVsOiAnd2FybicgfV0pXG5cbiAgICBhc3NlcnQuZGVlcEVxdWFsKGxlZShydXRhQSksIGxlZShydXRhQiksICd1biBsb3RlIGVzIHVuIGRldGFsbGUgZGUgcmVuZGltaWVudG8sIG5vIG90cm8gZm9ybWF0bycpXG59KVxuXG50ZXN0KCd1biBsb3RlIHZhY2lvIG5vIGNyZWEgbmkgdG9jYSBlbCBmaWNoZXJvJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHJ1dGEgPSB0bXAoKVxuICAgIGNvbnN0IHNlbmRlciA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYycsIGZpbGVQYXRoOiBydXRhIH0pXG5cbiAgICBhd2FpdCBzZW5kZXIuc2VuZEJhdGNoISgnYycsIFtdKVxuXG4gICAgYXNzZXJ0LmVxdWFsKGZzLmV4aXN0c1N5bmMocnV0YSksIGZhbHNlKVxufSlcblxudGVzdCgnZWwgb3JpZ2VuIHNhbGUgc29sbyBzaSBsYSBjb25maWd1cmFjaW9uIGxvIHBpZGUnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3Qgc2luT3JpZ2VuID0gdG1wKCksIGNvbk9yaWdlbiA9IHRtcCgpXG4gICAgY29uc3QgYSA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYScsIGZpbGVQYXRoOiBzaW5PcmlnZW4sIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IGZhbHNlIH0pXG4gICAgY29uc3QgYiA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYicsIGZpbGVQYXRoOiBjb25PcmlnZW4sIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IGZhbHNlLCBvcmlnaW46IHRydWUgfSlcbiAgICBjb25zdCBtZW5zYWplID0geyBib2R5OiAnYWxnbyBwYXNvJywgb3JpZ2luOiB7IG5hbWVzcGFjZTogJ3Byb2R1Y2Npb24nLCBwb2Q6ICdhcGktNycsIGNvbnRhaW5lcjogJ2FwaScgfSB9XG5cbiAgICBhd2FpdCBhLnNlbmRCYXRjaCEoJ2EnLCBbbWVuc2FqZV0pXG4gICAgYXdhaXQgYi5zZW5kQmF0Y2ghKCdiJywgW21lbnNhamVdKVxuXG4gICAgYXNzZXJ0LmRlZXBFcXVhbChsZWUoc2luT3JpZ2VuKSwgWydhbGdvIHBhc28nXSwgJ3BvciBkZWZlY3RvLCBsb3MgZmljaGVyb3MgZGUgc2llbXByZSBubyBjYW1iaWFuIGRlIGZvcm1hJylcbiAgICBhc3NlcnQuZGVlcEVxdWFsKGxlZShjb25PcmlnZW4pLCBbJ1twcm9kdWNjaW9uL2FwaS03L2FwaV0gYWxnbyBwYXNvJ10pXG59KVxuXG50ZXN0KCdzaW4gcG9kLCBlbCBvcmlnZW4gc2UgaWRlbnRpZmljYSBwb3Igc3Ugc2VydmljaW8nLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YSA9IHRtcCgpXG4gICAgY29uc3Qgc2VuZGVyID0gYXdhaXQgY3JlYSh7IG5hbWU6ICdjJywgZmlsZVBhdGg6IHJ1dGEsIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IGZhbHNlLCBvcmlnaW46IHRydWUgfSlcblxuICAgIC8vIHVuIGV2ZW50byBkZSBuZWdvY2lvLCBvIGxvZyBkZSB1biBzZXJ2aWRvciBzaW4gY29udGVuZWRvcmVzXG4gICAgYXdhaXQgc2VuZGVyLnNlbmRCYXRjaCEoJ2MnLCBbeyBib2R5OiAnbGluZWEnLCBvcmlnaW46IHsgc2VydmljZTogJ2ZhY3R1cmFjaW9uJyB9IH1dKVxuXG4gICAgYXNzZXJ0LmRlZXBFcXVhbChsZWUocnV0YSksIFsnW2ZhY3R1cmFjaW9uXSBsaW5lYSddKVxufSlcblxudGVzdCgndW4gbWVuc2FqZSBzaW4gb3JpZ2VuIG5vIGRlamEgY29yY2hldGVzIHZhY2lvcycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBydXRhID0gdG1wKClcbiAgICBjb25zdCBzZW5kZXIgPSBhd2FpdCBjcmVhKHsgbmFtZTogJ2MnLCBmaWxlUGF0aDogcnV0YSwgdGltZXN0YW1wczogZmFsc2UsIGxldmVsczogZmFsc2UsIG9yaWdpbjogdHJ1ZSB9KVxuXG4gICAgYXdhaXQgc2VuZGVyLnNlbmRCYXRjaCEoJ2MnLCBbeyBib2R5OiAnc2luIG9yaWdlbicgfV0pXG5cbiAgICBhc3NlcnQuZGVlcEVxdWFsKGxlZShydXRhKSwgWydzaW4gb3JpZ2VuJ10pXG59KVxuXG50ZXN0KCdsYSByb3RhY2lvbiBjdWVudGEgZWwgbG90ZSBFTlRFUk8sIG5vIGxvIGRlamEgcGFzYXIgcG9yIHNlciB1bmEgc29sYSBlc2NyaXR1cmEnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YSA9IHRtcCgpXG4gICAgY29uc3Qgc2VuZGVyID0gYXdhaXQgY3JlYSh7IG5hbWU6ICdjJywgZmlsZVBhdGg6IHJ1dGEsIHRpbWVzdGFtcHM6IGZhbHNlLCBsZXZlbHM6IGZhbHNlLCBtYXhMaW5lczogNSB9KVxuXG4gICAgYXdhaXQgc2VuZGVyLnNlbmRCYXRjaCEoJ2MnLCBbeyBib2R5OiAnMScgfSwgeyBib2R5OiAnMicgfSwgeyBib2R5OiAnMycgfV0pXG4gICAgYXdhaXQgc2VuZGVyLnNlbmRCYXRjaCEoJ2MnLCBbeyBib2R5OiAnNCcgfSwgeyBib2R5OiAnNScgfSwgeyBib2R5OiAnNicgfV0pXG5cbiAgICAvLyBlbCBzZWd1bmRvIGxvdGUgY3J1emEgZWwgbGltaXRlOiByb3RhIEFOVEVTIGRlIGVzY3JpYmlybG8sIHkgZWwgZmljaGVybyB2aXZvIHNlIHF1ZWRhIGNvbiBlbFxuICAgIGFzc2VydC5kZWVwRXF1YWwobGVlKHJ1dGEpLCBbJzQnLCAnNScsICc2J10pXG4gICAgY29uc3Qgcm90YWRvcyA9IGZzLnJlYWRkaXJTeW5jKHBhdGguZGlybmFtZShydXRhKSkuZmlsdGVyKGYgPT4gZi5pbmNsdWRlcygnLmJhaycpKVxuICAgIGFzc2VydC5lcXVhbChyb3RhZG9zLmxlbmd0aCwgMSwgJ3kgbG8gYW50ZXJpb3Igbm8gc2UgcGllcmRlOiBxdWVkYSBlbiBlbCAuYmFrJylcbn0pXG5cbnRlc3QoJ3NpbiBtYXhMaW5lcyBubyByb3RhIG51bmNhJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHJ1dGEgPSB0bXAoKVxuICAgIGNvbnN0IHNlbmRlciA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYycsIGZpbGVQYXRoOiBydXRhLCB0aW1lc3RhbXBzOiBmYWxzZSwgbGV2ZWxzOiBmYWxzZSB9KVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSBhd2FpdCBzZW5kZXIuc2VuZEJhdGNoISgnYycsIFt7IGJvZHk6IGBsaW5lYSAke2l9YCB9XSlcblxuICAgIGFzc2VydC5lcXVhbChsZWUocnV0YSkubGVuZ3RoLCA1MClcbiAgICBhc3NlcnQuZXF1YWwoZnMucmVhZGRpclN5bmMocGF0aC5kaXJuYW1lKHJ1dGEpKS5maWx0ZXIoZiA9PiBmLmluY2x1ZGVzKCcuYmFrJykpLmxlbmd0aCwgMClcbn0pXG5cbnRlc3QoJ3VuYSBjb25maWcgcXVlIG5vIGV4aXN0ZSBzZSBxdWVqYSwgZW4gdmV6IGRlIGVzY3JpYmlyIGVuIGN1YWxxdWllciBzaXRpbycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBzZW5kZXIgPSBhd2FpdCBjcmVhKHsgbmFtZTogJ2MnLCBmaWxlUGF0aDogdG1wKCkgfSlcblxuICAgIGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlbmRlci5zZW5kQmF0Y2ghKCdsYS1xdWUtbm8tZXMnLCBbeyBib2R5OiAneCcgfV0pKVxufSlcblxudGVzdCgnc2VuZCB5IHNlbmRCYXRjaCBjb21wYXJ0ZW4gZWwgY29udGFkb3IgZGUgbGluZWFzJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHJ1dGEgPSB0bXAoKVxuICAgIGNvbnN0IHNlbmRlciA9IGF3YWl0IGNyZWEoeyBuYW1lOiAnYycsIGZpbGVQYXRoOiBydXRhLCB0aW1lc3RhbXBzOiBmYWxzZSwgbGV2ZWxzOiBmYWxzZSwgbWF4TGluZXM6IDQgfSlcblxuICAgIGF3YWl0IHNlbmRlci5zZW5kKCdjJywgeyBib2R5OiAnYScgfSlcbiAgICBhd2FpdCBzZW5kZXIuc2VuZCgnYycsIHsgYm9keTogJ2InIH0pXG4gICAgLy8gZXN0ZSBsb3RlIGNydXphIGVsIGxpbWl0ZSBjb250YW5kbyB0YW1iaWVuIGxhcyBkb3Mgc3VlbHRhcyBhbnRlcmlvcmVzXG4gICAgYXdhaXQgc2VuZGVyLnNlbmRCYXRjaCEoJ2MnLCBbeyBib2R5OiAnYycgfSwgeyBib2R5OiAnZCcgfSwgeyBib2R5OiAnZScgfV0pXG5cbiAgICBhc3NlcnQuZGVlcEVxdWFsKGxlZShydXRhKSwgWydjJywgJ2QnLCAnZSddKVxufSlcblxudGVzdCgnY2FkYSBsaW5lYSBsbGV2YSBTVSBob3JhLCBubyBsYSBkZWwgbW9tZW50byBlbiBxdWUgc2UgZXNjcmliaW8gZWwgbG90ZScsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBydXRhID0gdG1wKClcbiAgICBjb25zdCBzZW5kZXIgPSBhd2FpdCBjcmVhKHsgbmFtZTogJ2MnLCBmaWxlUGF0aDogcnV0YSwgdGltZXN0YW1wczogdHJ1ZSwgbGV2ZWxzOiBmYWxzZSB9KVxuXG4gICAgLy8gZG9zIGxpbmVhcyBkZSBtb21lbnRvcyBkaXN0aW50b3MsIGVudHJlZ2FkYXMgZW4gZWwgTUlTTU8gbG90ZVxuICAgIGF3YWl0IHNlbmRlci5zZW5kQmF0Y2ghKCdjJywgW1xuICAgICAgICB7IGJvZHk6ICdhbnRlcycsIG9yaWdpbjogeyB0aW1lc3RhbXA6IERhdGUucGFyc2UoJzIwMjYtMDktMjNUMDg6MDA6MDAuMDAwWicpIH0gfSxcbiAgICAgICAgeyBib2R5OiAnZGVzcHVlcycsIG9yaWdpbjogeyB0aW1lc3RhbXA6IERhdGUucGFyc2UoJzIwMjYtMDktMjNUMDg6MDA6MDUuMDAwWicpIH0gfVxuICAgIF0pXG5cbiAgICBjb25zdCBsaW5lYXMgPSBsZWUocnV0YSlcbiAgICBhc3NlcnQub2sobGluZWFzWzBdLnN0YXJ0c1dpdGgoJ1syMDI2LTA5LTIzVDA4OjAwOjAwLjAwMFpdJyksIGxpbmVhc1swXSlcbiAgICBhc3NlcnQub2sobGluZWFzWzFdLnN0YXJ0c1dpdGgoJ1syMDI2LTA5LTIzVDA4OjAwOjA1LjAwMFpdJyksIGxpbmVhc1sxXSlcbn0pXG5cbnRlc3QoJ3NpbiBob3JhIHByb3BpYSBzZSB1c2EgbGEgZGUgZXNjcml0dXJhOiB1bmEgbGluZWEgc2luIGZlY2hhIHNpZ3VlIHNpZW5kbyB1bmEgbGluZWEnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YSA9IHRtcCgpXG4gICAgY29uc3Qgc2VuZGVyID0gYXdhaXQgY3JlYSh7IG5hbWU6ICdjJywgZmlsZVBhdGg6IHJ1dGEsIHRpbWVzdGFtcHM6IHRydWUsIGxldmVsczogZmFsc2UgfSlcblxuICAgIGF3YWl0IHNlbmRlci5zZW5kQmF0Y2ghKCdjJywgW3sgYm9keTogJ3NpbiBob3JhJyB9XSlcblxuICAgIGFzc2VydC5tYXRjaChsZWUocnV0YSlbMF0sIC9eXFxbXFxkezR9LVxcZHsyfS1cXGR7Mn1ULylcbn0pXG5cbnRlc3QoJ2xldmVscyBhcGFnYWRvIEVYUExJQ0lUQU1FTlRFIG5vIHBpbnRhIGVsIG5pdmVsJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHJ1dGEgPSB0bXAoKVxuICAgIC8vIGVsIGNhc28gcXVlIGZhbGxhYmE6IGVsIGRpYWxvZ28gb21pdGlhIGxhIGNsYXZlIGFsIGRlc21hcmNhcmxhIHkgZWwgc2VuZGVyIGFwbGljYWJhIHN1XG4gICAgLy8gZGVmZWN0byAodHJ1ZSksIGFzaSBxdWUgZWwgaW50ZXJydXB0b3Igc2UgdmVpYSBhcGFnYWRvIHkgZWwgbml2ZWwgc2FsaWEgaWd1YWxcbiAgICBjb25zdCBzZW5kZXIgPSBhd2FpdCBjcmVhKHsgbmFtZTogJ2MnLCBmaWxlUGF0aDogcnV0YSwgdGltZXN0YW1wczogZmFsc2UsIGxldmVsczogZmFsc2UgfSlcblxuICAgIGF3YWl0IHNlbmRlci5zZW5kQmF0Y2ghKCdjJywgW3sgYm9keTogJ3NpbiBuaXZlbCcsIGxldmVsOiAnd2FybicgfV0pXG5cbiAgICBhc3NlcnQuZGVlcEVxdWFsKGxlZShydXRhKSwgWydzaW4gbml2ZWwnXSlcbn0pXG5cbnRlc3QoJ3NpbiBkZWNpciBuYWRhIHNvYnJlIGxldmVscywgc2UgcGludGE6IGVzIGVsIGRlZmVjdG8gZGVjbGFyYWRvIGVuIGVsIGVzcXVlbWEnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgcnV0YSA9IHRtcCgpXG4gICAgY29uc3Qgc2VuZGVyID0gYXdhaXQgY3JlYSh7IG5hbWU6ICdjJywgZmlsZVBhdGg6IHJ1dGEsIHRpbWVzdGFtcHM6IGZhbHNlIH0pXG5cbiAgICBhd2FpdCBzZW5kZXIuc2VuZEJhdGNoISgnYycsIFt7IGJvZHk6ICdjb24gbml2ZWwnLCBsZXZlbDogJ3dhcm4nIH1dKVxuXG4gICAgYXNzZXJ0LmRlZXBFcXVhbChsZWUocnV0YSksIFsnW1dBUk5dIGNvbiBuaXZlbCddKVxufSlcbiIsICJpbXBvcnQgeyBJU2VuZGVyLCBJU2VuZGVyQWNjZXNzLCBJU2VuZGVyQ29uZmlnLCBJU2VuZGVyRmllbGREZWYsIElTZW5kZXJNZXNzYWdlIH0gZnJvbSAnQGt3aXJ0aG1hZ25pZnkva3dpcnRoLWNvbW1vbi1iYWNrJ1xuaW1wb3J0IGZzIGZyb20gJ2ZzJ1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCdcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENvbmZpZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVNlbmRlckNvbmZpZyBleHRlbmRzIElTZW5kZXJDb25maWcge1xuICAgIG5hbWU6IHN0cmluZ1xuICAgIGZpbGVQYXRoOiBzdHJpbmcgICAgICAgLy8gYWJzb2x1dGUgb3IgcmVsYXRpdmUgcGF0aCB0byB0aGUgbG9nIGZpbGVcbiAgICB0aW1lc3RhbXBzPzogYm9vbGVhbiAgIC8vIGluY2x1ZGUgSVNPIHRpbWVzdGFtcCAoZGVmYXVsdDogdHJ1ZSlcbiAgICBsZXZlbHM/OiBib29sZWFuICAgICAgIC8vIGluY2x1ZGUgbGV2ZWwgdGFnIChkZWZhdWx0OiB0cnVlKVxuICAgIG1heExpbmVzPzogbnVtYmVyICAgICAgLy8gaWYgc2V0LCByb3RhdGUgZmlsZSB3aGVuIGl0IGV4Y2VlZHMgdGhpcyBtYW55IGxpbmVzICgwID0gbm8gbGltaXQpXG4gICAgb3JpZ2luPzogYm9vbGVhbiAgICAgICAvLyBwcmVmaXggZWFjaCBsaW5lIHdpdGggd2hlcmUgaXQgY2FtZSBmcm9tIChkZWZhdWx0OiBmYWxzZSlcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFNlbmRlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGNsYXNzIEZpbGVTZW5kZXIgaW1wbGVtZW50cyBJU2VuZGVyIHtcbiAgICByZWFkb25seSBpZCA9ICdmaWxlJ1xuICAgIHJlYWRvbmx5IHNlbmRlclR5cGUgPSAnb3V0cHV0JyBhcyBjb25zdFxuICAgIHByaXZhdGUgY29uZmlncyA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVNlbmRlckNvbmZpZz4oKVxuICAgIGdldE5vZGVNZXRhKCkgeyByZXR1cm4geyBsYWJlbDogJ0ZpbGUnLCBpY29uOiAnRGVzY3JpcHRpb24nIH0gfVxuICAgIHByaXZhdGUgbGluZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCkgIC8vIGNvbmZpZ05hbWUgLT4gY3VycmVudCBsaW5lIGNvdW50XG5cbiAgICBhZGRDb25maWcoY29uZmlnOiBJU2VuZGVyQ29uZmlnKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGZjID0gY29uZmlnIGFzIElGaWxlU2VuZGVyQ29uZmlnXG4gICAgICAgIHRoaXMuY29uZmlncy5zZXQoZmMubmFtZSwgZmMpXG5cbiAgICAgICAgLy8gQ291bnQgZXhpc3RpbmcgbGluZXMgc28gcm90YXRpb24gcmVzcGVjdHMgcHJlLWV4aXN0aW5nIGNvbnRlbnRcbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBwYXRoLnJlc29sdmUoZmMuZmlsZVBhdGgpXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHJlc29sdmVkKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlc29sdmVkLCAndXRmLTgnKVxuICAgICAgICAgICAgICAgIHRoaXMubGluZUNvdW50cy5zZXQoZmMubmFtZSwgY29udGVudC5zcGxpdCgnXFxuJykubGVuZ3RoIC0gMSlcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIHRoaXMubGluZUNvdW50cy5zZXQoZmMubmFtZSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEVuc3VyZSBwYXJlbnQgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShyZXNvbHZlZCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgICAgICAgICB0aGlzLmxpbmVDb3VudHMuc2V0KGZjLm5hbWUsIDApXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW1vdmVDb25maWcobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29uZmlncy5kZWxldGUobmFtZSlcbiAgICAgICAgdGhpcy5saW5lQ291bnRzLmRlbGV0ZShuYW1lKVxuICAgIH1cblxuICAgIGhhc0NvbmZpZyhuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlncy5oYXMobmFtZSlcbiAgICB9XG5cbiAgICBnZXRDb25maWdOYW1lcygpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuY29uZmlncy5rZXlzKCkpXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogT25lIGZvcm1hdHRlZCBsaW5lLiBTaGFyZWQgYnkgc2VuZCgpIGFuZCBzZW5kQmF0Y2goKSBzbyBib3RoIHdyaXRlIGV4YWN0bHkgdGhlIHNhbWUgdGhpbmcgXHUyMDE0XG4gICAgICogYSBiYXRjaCBpcyBhIHBlcmZvcm1hbmNlIGRldGFpbCwgbm90IGEgZGlmZmVyZW50IGZvcm1hdC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGZvcm1hdExpbmUoY29uZmlnOiBJRmlsZVNlbmRlckNvbmZpZywgbWVzc2FnZTogSVNlbmRlck1lc3NhZ2UpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB1c2VUaW1lc3RhbXBzID0gY29uZmlnLnRpbWVzdGFtcHMgPz8gdHJ1ZVxuICAgICAgICBjb25zdCB1c2VMZXZlbHMgICAgID0gY29uZmlnLmxldmVscyA/PyB0cnVlXG5cbiAgICAgICAgLypcbiAgICAgICAgICogVGhlIGxpbmUncyBPV04gdGltZSB3aGVuIHRoZSBwcm9kdWNlciBzdGF0ZXMgaXQsIGFuZCBvbmx5IG90aGVyd2lzZSB0aGUgdGltZSBvZiB3cml0aW5nLlxuICAgICAgICAgKiBJdCBtYXR0ZXJzIHdpdGggYmF0Y2hlczogYSBmb3J3YXJkZXIgaGFuZHMgb3ZlciBhIGh1bmRyZWQgbGluZXMgYXQgb25jZSwgYW5kIHN0YW1waW5nIHRoZW1cbiAgICAgICAgICogYWxsIHdpdGggdGhlIG1vbWVudCB0aGV5IHdlcmUgd3JpdHRlbiBnaXZlcyBmaWZ0ZWVuIGxpbmVzIHRoZSBzYW1lIGluc3RhbnQgXHUyMDE0IGxvc2luZyBleGFjdGx5XG4gICAgICAgICAqIHdoYXQgbWFrZXMgYSBsb2cgdXNlZnVsLlxuICAgICAgICAgKi9cbiAgICAgICAgY29uc3QgY3VhbmRvID0gbWVzc2FnZS5vcmlnaW4/LnRpbWVzdGFtcCA/IG5ldyBEYXRlKG1lc3NhZ2Uub3JpZ2luLnRpbWVzdGFtcCkgOiBuZXcgRGF0ZSgpXG4gICAgICAgIGNvbnN0IHRzICAgID0gdXNlVGltZXN0YW1wcyA/IGBbJHtjdWFuZG8udG9JU09TdHJpbmcoKX1dIGAgOiAnJ1xuICAgICAgICBjb25zdCBsZXZlbCA9IG1lc3NhZ2UubGV2ZWwgPz8gJ2luZm8nXG4gICAgICAgIGNvbnN0IGx2VGFnID0gdXNlTGV2ZWxzID8gYFske2xldmVsLnRvVXBwZXJDYXNlKCl9XSBgIDogJydcblxuICAgICAgICBjb25zdCBzdWJqZWN0ID0gbWVzc2FnZS5zdWJqZWN0ID8gYCR7bWVzc2FnZS5zdWJqZWN0fTogYCA6ICcnXG4gICAgICAgIGNvbnN0IHRvICAgICAgPSBtZXNzYWdlLnRvID8gYCBcdTIxOTIgJHtBcnJheS5pc0FycmF5KG1lc3NhZ2UudG8pID8gbWVzc2FnZS50by5qb2luKCcsICcpIDogbWVzc2FnZS50b31gIDogJydcblxuICAgICAgICAvKlxuICAgICAgICAgKiBXaGVyZSB0aGUgbGluZSBjYW1lIGZyb20sIHdoZW4gdGhlIHByb2R1Y2VyIGJvdGhlcmVkIHRvIHNheSBpdCBhbmQgdGhpcyBjb25maWcgYXNrcyBmb3IgaXQuXG4gICAgICAgICAqIE9mZiBieSBkZWZhdWx0OiBpdCBjaGFuZ2VzIHRoZSBzaGFwZSBvZiBldmVyeSBsaW5lLCBhbmQgZXhpc3RpbmcgZmlsZXMgc2hvdWxkIGtlZXAgbG9va2luZ1xuICAgICAgICAgKiBsaWtlIHRoZXkgZGlkLiBGb3IgbG9nIGZvcndhcmRpbmcgaXQgaXMgdGhlIHdob2xlIHBvaW50IFx1MjAxNCB3aXRob3V0IGl0IGEgZmlsZSBvZiBsaW5lcyBmcm9tXG4gICAgICAgICAqIHR3ZW50eSBwb2RzIGlzIHVucmVhZGFibGUuXG4gICAgICAgICAqL1xuICAgICAgICBsZXQgb3JpZ2luID0gJydcbiAgICAgICAgaWYgKChjb25maWcub3JpZ2luID8/IGZhbHNlKSAmJiBtZXNzYWdlLm9yaWdpbikge1xuICAgICAgICAgICAgY29uc3QgbyA9IG1lc3NhZ2Uub3JpZ2luXG4gICAgICAgICAgICBjb25zdCBwYXJ0ZXMgPSBbby5uYW1lc3BhY2UsIG8ucG9kLCBvLmNvbnRhaW5lcl0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJy8nKVxuICAgICAgICAgICAgY29uc3QgZXRpcXVldGEgPSBwYXJ0ZXMgfHwgby5zZXJ2aWNlIHx8ICcnXG4gICAgICAgICAgICBpZiAoZXRpcXVldGEpIG9yaWdpbiA9IGBbJHtldGlxdWV0YX1dIGBcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHt0c30ke2x2VGFnfSR7b3JpZ2lufSR7c3ViamVjdH0ke21lc3NhZ2UuYm9keX0ke3RvfVxcbmBcbiAgICB9XG5cbiAgICAvKiogUm90YXRlcyB3aGVuIG1heExpbmVzIGlzIHNldCBhbmQgZXhjZWVkZWQsIGNvdW50aW5nIGhvdyBtYW55IGxpbmVzIGFyZSBhYm91dCB0byBiZSB3cml0dGVuLiAqL1xuICAgIHByaXZhdGUgcm90YXRlSWZOZWVkZWQoY29uZmlnTmFtZTogc3RyaW5nLCBjb25maWc6IElGaWxlU2VuZGVyQ29uZmlnLCByZXNvbHZlZDogc3RyaW5nLCBpbmNvbWluZzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IG1heExpbmVzICA9IGNvbmZpZy5tYXhMaW5lcyA/PyAwXG4gICAgICAgIGNvbnN0IGxpbmVDb3VudCA9IHRoaXMubGluZUNvdW50cy5nZXQoY29uZmlnTmFtZSkgPz8gMFxuICAgICAgICBpZiAobWF4TGluZXMgPiAwICYmIGxpbmVDb3VudCArIGluY29taW5nID4gbWF4TGluZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJvdGF0ZWQgPSBgJHtyZXNvbHZlZH0uJHtEYXRlLm5vdygpfS5iYWtgXG4gICAgICAgICAgICB0cnkgeyBmcy5yZW5hbWVTeW5jKHJlc29sdmVkLCByb3RhdGVkKSB9IGNhdGNoIHt9XG4gICAgICAgICAgICB0aGlzLmxpbmVDb3VudHMuc2V0KGNvbmZpZ05hbWUsIDApXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBzZW5kKGNvbmZpZ05hbWU6IHN0cmluZywgbWVzc2FnZTogSVNlbmRlck1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgY29uZmlnID0gdGhpcy5jb25maWdzLmdldChjb25maWdOYW1lKVxuICAgICAgICBpZiAoIWNvbmZpZykgdGhyb3cgbmV3IEVycm9yKGBGaWxlU2VuZGVyOiBjb25maWcgJyR7Y29uZmlnTmFtZX0nIG5vdCBmb3VuZGApXG5cbiAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBwYXRoLnJlc29sdmUoY29uZmlnLmZpbGVQYXRoKVxuICAgICAgICB0aGlzLnJvdGF0ZUlmTmVlZGVkKGNvbmZpZ05hbWUsIGNvbmZpZywgcmVzb2x2ZWQsIDEpXG5cbiAgICAgICAgZnMuYXBwZW5kRmlsZVN5bmMocmVzb2x2ZWQsIHRoaXMuZm9ybWF0TGluZShjb25maWcsIG1lc3NhZ2UpLCAndXRmLTgnKVxuICAgICAgICB0aGlzLmxpbmVDb3VudHMuc2V0KGNvbmZpZ05hbWUsICh0aGlzLmxpbmVDb3VudHMuZ2V0KGNvbmZpZ05hbWUpID8/IDApICsgMSlcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBIHdob2xlIGJhdGNoIGluIE9ORSB3cml0ZS5cbiAgICAgKlxuICAgICAqIFRoaXMgaXMgd2hhdCBgc2VuZEJhdGNoYCBpcyBmb3I6IGEgbG9nIGZvcndhcmRlciBoYW5kcyBvdmVyIGEgaHVuZHJlZCBsaW5lcyBhdCBhIHRpbWUsIGFuZCBkb2luZ1xuICAgICAqIGEgc3lzY2FsbCBwZXIgbGluZSB0dXJucyBhIGNoZWFwIGFwcGVuZCBpbnRvIHRoZSBzbG93ZXN0IHBhcnQgb2YgdGhlIHBpcGVsaW5lLiBUaGUgZm9ybWF0IGlzXG4gICAgICogaWRlbnRpY2FsIHRvIHNlbmQoKSdzLCBzbyBhIGZpbGUgd3JpdHRlbiBlaXRoZXIgd2F5IHJlYWRzIHRoZSBzYW1lLlxuICAgICAqL1xuICAgIGFzeW5jIHNlbmRCYXRjaChjb25maWdOYW1lOiBzdHJpbmcsIG1lc3NhZ2VzOiBJU2VuZGVyTWVzc2FnZVtdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlncy5nZXQoY29uZmlnTmFtZSlcbiAgICAgICAgaWYgKCFjb25maWcpIHRocm93IG5ldyBFcnJvcihgRmlsZVNlbmRlcjogY29uZmlnICcke2NvbmZpZ05hbWV9JyBub3QgZm91bmRgKVxuICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAgICAgICBjb25zdCByZXNvbHZlZCA9IHBhdGgucmVzb2x2ZShjb25maWcuZmlsZVBhdGgpXG4gICAgICAgIHRoaXMucm90YXRlSWZOZWVkZWQoY29uZmlnTmFtZSwgY29uZmlnLCByZXNvbHZlZCwgbWVzc2FnZXMubGVuZ3RoKVxuXG4gICAgICAgIGNvbnN0IGJsb3F1ZSA9IG1lc3NhZ2VzLm1hcChtID0+IHRoaXMuZm9ybWF0TGluZShjb25maWcsIG0pKS5qb2luKCcnKVxuICAgICAgICBmcy5hcHBlbmRGaWxlU3luYyhyZXNvbHZlZCwgYmxvcXVlLCAndXRmLTgnKVxuICAgICAgICB0aGlzLmxpbmVDb3VudHMuc2V0KGNvbmZpZ05hbWUsICh0aGlzLmxpbmVDb3VudHMuZ2V0KGNvbmZpZ05hbWUpID8/IDApICsgbWVzc2FnZXMubGVuZ3RoKVxuICAgIH1cblxuICAgIGdldENvbmZpZ1NjaGVtYSgpOiBJU2VuZGVyRmllbGREZWZbXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICB7IG5hbWU6ICduYW1lJywgbGFiZWw6ICdOYW1lJywgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgICAgIHsgbmFtZTogJ2ZpbGVQYXRoJywgbGFiZWw6ICdGaWxlIHBhdGgnLCByZXF1aXJlZDogdHJ1ZSB9LFxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAqIFRoZSBkZWZhdWx0cyBhcmUgREVDTEFSRUQsIG5vdCBqdXN0IGFwcGxpZWQgZnVydGhlciBkb3duOiB0aGUgZGlhbG9nIHBhaW50cyBhIHN3aXRjaCBmcm9tXG4gICAgICAgICAgICAgKiB0aGUgc2NoZW1hLCBzbyBhIGZpZWxkIHdob3NlIGRlZmF1bHQgaXMgdHJ1ZSBidXQgc2F5cyBub3RoaW5nIHNob3dzIHVwIGFzIG9mZiB3aGlsZVxuICAgICAgICAgICAgICogYmVoYXZpbmcgYXMgb24uIFdoYXQgeW91IHNlZSBoYXMgdG8gYmUgd2hhdCB5b3UgZ2V0LlxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB7IG5hbWU6ICd0aW1lc3RhbXBzJywgbGFiZWw6ICdUaW1lc3RhbXBzJywgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiB0cnVlIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdsZXZlbHMnLCBsYWJlbDogJ0xldmVscycsIHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBuYW1lOiAnbWF4TGluZXMnLCBsYWJlbDogJ01heCBsaW5lcycsIHR5cGU6ICdudW1iZXInIH0sXG4gICAgICAgICAgICB7IG5hbWU6ICdvcmlnaW4nLCBsYWJlbDogJ1ByZWZpeCBlYWNoIGxpbmUgd2l0aCBpdHMgb3JpZ2luJywgdHlwZTogJ2Jvb2xlYW4nIH0sXG4gICAgICAgIF1cbiAgICB9XG5cbiAgICBhc3luYyBzdGFydFNlbmRlcihfc2VuZGVyczogSVNlbmRlckFjY2Vzcyk6IFByb21pc2U8dm9pZD4ge31cblxuICAgIGFzeW5jIHN0b3BTZW5kZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIC8vIE5vdGhpbmcgdG8gZmx1c2ggXHUyMDE0IGFwcGVuZEZpbGVTeW5jIGlzIHN5bmNocm9ub3VzXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBGaWxlU2VuZGVyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTtBQUNuQixPQUFPQSxTQUFRO0FBQ2YsT0FBTyxRQUFRO0FBQ2YsT0FBT0MsV0FBVTs7O0FDSGpCLE9BQU8sUUFBUTtBQUNmLE9BQU8sVUFBVTtBQWVWLElBQU0sYUFBTixNQUFvQztBQUFBLEVBQXBDO0FBQ0gsU0FBUyxLQUFLO0FBQ2QsU0FBUyxhQUFhO0FBQ3RCLFNBQVEsVUFBVSxvQkFBSSxJQUErQjtBQUVyRCxTQUFRLGFBQWEsb0JBQUksSUFBb0I7QUFBQTtBQUFBLEVBRDdDLGNBQWM7QUFBRSxXQUFPLEVBQUUsT0FBTyxRQUFRLE1BQU0sY0FBYztBQUFBLEVBQUU7QUFBQTtBQUFBLEVBRzlELFVBQVUsUUFBNkI7QUFDbkMsVUFBTSxLQUFLO0FBQ1gsU0FBSyxRQUFRLElBQUksR0FBRyxNQUFNLEVBQUU7QUFHNUIsVUFBTSxXQUFXLEtBQUssUUFBUSxHQUFHLFFBQVE7QUFDekMsUUFBSSxHQUFHLFdBQVcsUUFBUSxHQUFHO0FBQ3pCLFVBQUk7QUFDQSxjQUFNLFVBQVUsR0FBRyxh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QUFJLENBQUMsQ0FBQztBQUUxRSxTQUFPLFVBQVUsSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQy9DLENBQUM7QUFFRCxLQUFLLDBFQUEwRSxZQUFZO0FBQ3ZGLFFBQU0sT0FBTyxJQUFJO0FBQ2pCLFFBQU0sU0FBUyxNQUFNLEtBQUssRUFBRSxNQUFNLEtBQUssVUFBVSxNQUFNLFlBQVksTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUd4RixRQUFNLE9BQU8sVUFBVyxLQUFLO0FBQUEsSUFDekIsRUFBRSxNQUFNLFNBQVMsUUFBUSxFQUFFLFdBQVcsS0FBSyxNQUFNLDBCQUEwQixFQUFFLEVBQUU7QUFBQSxJQUMvRSxFQUFFLE1BQU0sV0FBVyxRQUFRLEVBQUUsV0FBVyxLQUFLLE1BQU0sMEJBQTBCLEVBQUUsRUFBRTtBQUFBLEVBQ3JGLENBQUM7QUFFRCxRQUFNLFNBQVMsSUFBSSxJQUFJO0FBQ3ZCLFNBQU8sR0FBRyxPQUFPLENBQUMsRUFBRSxXQUFXLDRCQUE0QixHQUFHLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZFLFNBQU8sR0FBRyxPQUFPLENBQUMsRUFBRSxXQUFXLDRCQUE0QixHQUFHLE9BQU8sQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUFFRCxLQUFLLHNGQUFzRixZQUFZO0FBQ25HLFFBQU0sT0FBTyxJQUFJO0FBQ2pCLFFBQU0sU0FBUyxNQUFNLEtBQUssRUFBRSxNQUFNLEtBQUssVUFBVSxNQUFNLFlBQVksTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUV4RixRQUFNLE9BQU8sVUFBVyxLQUFLLENBQUMsRUFBRSxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBRW5ELFNBQU8sTUFBTSxJQUFJLElBQUksRUFBRSxDQUFDLEdBQUcsdUJBQXVCO0FBQ3RELENBQUM7QUFFRCxLQUFLLG1EQUFtRCxZQUFZO0FBQ2hFLFFBQU0sT0FBTyxJQUFJO0FBR2pCLFFBQU0sU0FBUyxNQUFNLEtBQUssRUFBRSxNQUFNLEtBQUssVUFBVSxNQUFNLFlBQVksT0FBTyxRQUFRLE1BQU0sQ0FBQztBQUV6RixRQUFNLE9BQU8sVUFBVyxLQUFLLENBQUMsRUFBRSxNQUFNLGFBQWEsT0FBTyxPQUFPLENBQUMsQ0FBQztBQUVuRSxTQUFPLFVBQVUsSUFBSSxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUM7QUFDN0MsQ0FBQztBQUVELEtBQUssZ0ZBQWdGLFlBQVk7QUFDN0YsUUFBTSxPQUFPLElBQUk7QUFDakIsUUFBTSxTQUFTLE1BQU0sS0FBSyxFQUFFLE1BQU0sS0FBSyxVQUFVLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFFMUUsUUFBTSxPQUFPLFVBQVcsS0FBSyxDQUFDLEVBQUUsTUFBTSxhQUFhLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFFbkUsU0FBTyxVQUFVLElBQUksSUFBSSxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDcEQsQ0FBQzsiLAogICJuYW1lcyI6IFsiZnMiLCAicGF0aCIsICJmcyIsICJwYXRoIl0KfQo=
