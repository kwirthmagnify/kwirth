# Plan: eliminar el daemon censor y llevar toda la funcionalidad al channel back

**Decisión de diseño (confirmada):** modo **solo efímero**. Censor analiza únicamente
mientras hay una conexión WebSocket (pestaña) abierta. Se elimina toda la familia
`SESSION*` (background persistente + reconexión) y su UI. Se conserva el nombre de
sesión efímera (`ephemeralSessionName`) como etiqueta de "instancia lista", pero
generado por el propio channel, no por el daemon.

**Restricción de trabajo:** solo se tocan `daemons/censor/**` y `plugins/censor/**`.
No se modifica `back/`, `common/`, `common-back/`, `common-ai/` ni otros plugins.

---

## 1. Análisis de la situación actual

### Reparto de responsabilidades hoy
- **Daemon** (`daemons/censor/src/back/index.ts`, `CensorDaemon`): contiene TODO el motor:
  - Streaming de logs por pod (`PassThrough` + `clusterInfo.logApi.log`).
  - Descubrimiento de pods en modo cluster (`coreApi.listPodForAllNamespaces`) e
    `initInstance` / `rediscoverClusterPods`.
  - Runners múltiples por instancia (`Map<name:version, IConfigRunner>`), cada uno con
    su buffer, regexes, stats y estado `analyzing`.
  - Llamadas al LLM (`generateText`, `buildModel`, `zodFromExample`, providers).
  - Procesado de eventos de providers `events` / `business` / `syslog`.
  - Acumulación de regex, stats throttled, envío de alertas por `senders`.
  - Persistencia (`censor-configs`, `censor-regexes-<name>`) y broadcast a subscribers.
- **Channel back** (`plugins/censor/src/back/index.ts`, `CensorChannel`): actúa como
  **proxy** hacia el daemon vía `daemonManager`:
  - `autoStartDaemon` crea una instancia daemon efímera y le hace `configset`.
  - Reenvía comandos WS → `dm.sendCommand(...)`.
  - Reenvía eventos daemon → WS (`forwardDaemonEvent`).
  - Gestiona la familia `SESSION*` (crear/listar/conectar/parar instancias daemon).
  - Solo procesa directamente `events` DELETED (limpieza de assets).

### Viabilidad verificada
- `IBackChannelObject` (`common/src/Channel.ts`) expone **todas** las primitivas que usa
  el daemon vía `IBackDaemonObject` (`readStorage`/`writeStorage`/`*Common`, `senders`,
  `logInfo/Warning/Error`) **más** `daemonManager` (que dejaremos de usar).
- El channel accede a `clusterInfo.logApi.log(...)` y `coreApi.listPodForAllNamespaces()`
  igual que el daemon — confirmado en `plugins/log/src/back/index.ts:197`.
- El channel ya recibe eventos de providers (`requirements.providers =
  ['events','business','syslog']` + `processProviderEvent` + `rebuildBusinessSubscription`).
  Hoy delega `business`/`syslog` al daemon; pasará a procesarlos él mismo.
- El subpath `@kwirthmagnify/kwirth-common-ai/back` (`buildModel`, `loadModels`,
  `zodFromExample`) ya está disponible en el plugin (se importa `loadModels`). **No hacen
  falta nuevas dependencias.**

### Equivalencias clave para el port
| Daemon | Channel autónomo |
|---|---|
| `IDaemonInstance` (por `instanceId` daemon) | `IInstance` (por `instanceId` de canal, dentro de `connections[].instances`) |
| `this.broadcast(inst, kind, data)` | `this.sendEvent(instance, kind, data)` (WS directo, con backpressure de `forwardDaemonEvent`) |
| `subscribe` / subscribers | (se elimina; envío directo al WS de la instancia) |
| `initInstance` cluster discovery | dentro de `addObject` cuando `ns/pod/container === '*all'` |
| `processProviderEvent` (daemon) | `processProviderEvent` (channel), iterando `connections[].instances` |
| `processCommand(ECensorDaemonCommand)` | fusionado dentro de `processCommand(ECensorCommand)` del channel |

---

## 2. Diseño objetivo del channel back autónomo

`IInstance` pasa a contener el estado que hoy vive en `IDaemonInstance` + `IConfigRunner`:
- `runners: Map<string, IConfigRunner>` (portado tal cual, con `passThroughStream` en assets).
- `assets: IAsset[]` con `passThroughStream: PassThrough` y `runnerIds: Set<string>`.
- `scope: 'cluster' | 'resource'` derivado de `instanceConfig.view === CLUSTER`.
- Timers (`receivedTimer`) y `pendingReceivedLines` para broadcast throttled.

Se **eliminan** de `IInstance`: `sessionId`, `sessionUnsub`, `ephemeral`,
`ephemeralDescription` (se sustituye por una etiqueta local), `_startupPromise`.

Métodos portados desde `CensorDaemon` a `CensorChannel` (privados):
`processChunk`, `callLlm`, `effectiveBatchSize`, `broadcastStats`,
`scheduleReceivedBroadcast`, `saveRegexesForConfig`, `matchesLabelSelector`,
`extractText`, `cleanANSI`, `podMatchesRunnerCfg`, discovery de cluster.
Constantes: `BATCH_SIZE`, `MAX_LINE_BUFFER`, `DEFAULT_SYSTEM`, `DEFAULT_USER_PROMPT`.
Enum `ERegexOrigin` ya existe en `common/CensorTypes.ts` → usar ese (no duplicar; cumple
regla "enums en common").

`sendEvent(instance, kind, data)` = mismo cuerpo que `forwardDaemonEvent` (mapeo a
`ICensorMessage`, `readyState`, backpressure `LOW_PRIORITY` + `bufferedAmount`), pero
recibiendo `(kind, data)` en vez de un `IDaemonEvent`.

---

## 3. Fases (cada fase entrega valor usable; parar y validar por stream)

### FASE 1 — Channel back autónomo (corte del daemon)
> MVP: censor funciona end-to-end **sin daemon** en todas sus fuentes. Es un corte
> atómico: mientras el daemon siga arrancándose (`autoStartDaemon`) no se puede cutover
> parcial por fuente sin doble-procesado, así que la Fase 1 se implementa completa antes
> de validar, pero se revisa por streams.

- **Stream 1.1 — Motor + tipos.** Portar constantes, `IConfigRunner`, `IAccumRegex`,
  `IAsset` (con `passThroughStream`), helpers (`cleanANSI`, `matchesLabelSelector`,
  `extractText`, `effectiveBatchSize`), y `sendEvent`. Reutilizar `ERegexOrigin` de common.
  *Check:* compila; sin cambios de comportamiento aún.
- **Stream 1.2 — Runners + CONFIG/ANALYZE locales.** Reescribir `CONFIGSET` para crear/
  actualizar runners en `instance.runners` (portando la lógica `configset` del daemon:
  runnerIds retroactivos, tear-down de assets huérfanos). `ANALYZESTART/STOP`,
  `REGEXADD/DELETE`, `REGEXESSAVE/GET`, `STATSGET`, `REGEXGET` operan sobre `instance.runners`
  y responden por WS directo. `CONFIGGET/SAVE/DELETE`, `PROVIDERS*` quedan como están
  (ya son locales) más el estado de runners.
  *Check:* `configset` crea runner; `analyzestart` marca analyzing; stats/regex por WS.
- **Stream 1.3 — Streaming resource-mode local.** `addObject` (no cluster) abre el
  `PassThrough` y `clusterInfo.logApi.log(...)`, con `logStream.on('data', processChunk)`.
  Portar `processChunk` + `callLlm` (LLM, regex, alertas por `senders`, autobatch).
  Eliminar `directAddObject`/`directDeleteObject` hacia el daemon.
  *Check (resource):* abrir censor sobre un pod → líneas recibidas, batches al LLM,
  regex acumulados, filtrado, alertas. Verificar filtrado por regex y truncado
  `maxLineLength`.
- **Stream 1.4 — Business + Syslog locales.** Portar ramas `business` y `syslog` de
  `processProviderEvent` al channel (fan-out por runner). Extender
  `rebuildBusinessSubscription` y añadir suscripción `syslog` según `syslogSources`.
  Reutilizar `getProviderSubscriptionData` para `business`.
  *Check:* con `businessSources`/`syslogSources` configurados, llegan eventos, se muestran
  y se procesan por el LLM; alertas OK.
- **Stream 1.5 — Cluster-mode local.** En `addObject` con `ns/pod/container === '*all'`,
  ejecutar el discovery (`coreApi.listPodForAllNamespaces` + filtros `logstreamAll`/
  `logstreamSources`/`labelSelector`). Portar `events` ADDED/DELETED de
  `processProviderEvent` para altas/bajas dinámicas de pods. Portar `rediscoverClusterPods`
  y llamarlo tras `configset` en cluster.
  *Check (cluster):* vista cluster → descubre pods que matchean, procesa, y al crear/borrar
  pods se añaden/quitan streams.

### FASE 2 — Limpieza del front (quitar sesiones persistentes)
> MVP: la UI de censor funciona igual pero sin la funcionalidad de sesiones background.

- Eliminar comandos `SESSIONLIST/START/STOP/CONNECT/DISCONNECT` de `ECensorCommand`
  (`CensorTypes.ts` y el `CensorConfig.ts` del front) y del `processCommand` del back.
- Eliminar componentes `CensorSessionPicker.tsx` y `CensorSessionStart.tsx` y sus imports.
- En `CensorTabContent.tsx`: quitar menú `Sessions`/`Launch`/`Delete session`, el
  `fetch(.../daemons/instances/...)` de `deleteSession`, y los diálogos de sesión.
  Mantener `ephemeralSessionName` como gate de "instancia lista".
- En `CensorData.ts`/`CensorChannel.ts` (front): retirar `connectedSessionId`,
  `selectedSessionId`, `pendingSessionId`, `sessions`, y las ramas de mensaje
  `sessions/sessionstarted/sessionconnected/sessionstopped/sessiondisconnected`.
  Conservar la rama `config` (que trae `sessionDescription` → `ephemeralSessionName`).
- Back: `executeConfigGet` deja de construir `sessions`; sigue enviando `ephemeralSessionName`
  generado localmente (p. ej. con `generateSessionName` sobre las instancias vivas del canal
  o un contador simple).
  *Check:* abrir tab → arranca "efímera" automáticamente, analiza, muestra stats/regex; no
  aparecen opciones de sesiones; no hay llamadas a `/daemons/instances`.

### FASE 3 — Retirada del daemon
> MVP: el daemon censor deja de existir; el sistema sigue funcionando.

- Vaciar/eliminar `daemons/censor/src/back/index.ts` (o borrar el paquete `daemons/censor`
  completo si el build del monorepo lo permite sin romper otros scripts).
- Quitar las entradas `id: "censor"` de `daemons/manifest.json`.
- (Opcional, coordinar) despublicar/omitir `@kwirthmagnify/kwirth-daemon-censor`.
  *Check regresión:* con el daemon ausente, censor resource + cluster + business + syslog
  siguen funcionando; el resto de daemons/plugins intactos.

---

## 4. Riesgos y puntos de atención
- **Doble procesado durante la transición:** el corte del daemon (dejar de llamar a
  `autoStartDaemon`/`daemonManager`) debe entrar junto con el streaming local en Fase 1;
  no dejar ambos caminos activos a la vez.
- **Ciclo de vida por WS:** al ser solo efímero, `stopInstance`/`removeConnection` deben
  destruir todos los `PassThrough` y limpiar timers de todos los runners (portar el cleanup
  de `stopInstance` del daemon) para no fugar streams de logs ni handles del LLM.
- **Regex persistidos:** conservar `censor-regexes-<name>` y `saveRegexesForConfig` en el
  channel (se guardan al `analyzestop`) para no perder aprendizaje entre aperturas de tab.
- **Providers/LLM:** `startChannel` ya carga providers; asegurar `buildModel` cacheado por
  runner igual que el daemon (evitar reconstrucción por batch).
- **Backpressure:** mantener el filtro `LOW_PRIORITY` + `bufferedAmount` en `sendEvent`.

## 5. Reglas de codificación aplicables
- Sin tipos `any` nuevos (el daemon usa varios `as any` en el parse del output LLM;
  intentar tiparlos o encapsular en un tipo nombrado — validar contigo antes de crear tipos).
- Enums cruzados back↔front en `common/CensorTypes.ts` (ya está `ERegexOrigin`).
- `switch` para el despacho de comandos (ya lo usa).
- Logs/UI en inglés; comentarios en español. No borrar `console.log` existentes.
