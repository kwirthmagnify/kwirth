# mIRC — plugin de chat para Kwirth

Chat de mensajería directa entre usuarios conectados a Kwirth, **a través de varios clusters**, con **buzón offline** y **doble-check estilo WhatsApp** (✓ enviado, ✓✓ entregado, ✓✓ azul leído). Una sola ventana de chat, mensajes 1:1, sin salas.

Este documento explica **qué hace, por qué está diseñado así, cómo funciona por dentro** y **qué falta endurecer**. Es deliberadamente exhaustivo.

---

## Índice

1. [Resumen](#1-resumen)
2. [Decisiones de arquitectura (el porqué)](#2-decisiones-de-arquitectura-el-porqué)
3. [Topología](#3-topología)
4. [Protocolo de mensajes](#4-protocolo-de-mensajes)
5. [Back: diseño detallado](#5-back-diseño-detallado)
6. [Front: diseño detallado](#6-front-diseño-detallado)
7. [Esquemas de almacenamiento](#7-esquemas-de-almacenamiento)
8. [Flujos paso a paso](#8-flujos-paso-a-paso)
9. [Identidad y seguridad](#9-identidad-y-seguridad)
10. [Simplificaciones de v1 y roadmap de endurecimiento](#10-simplificaciones-de-v1-y-roadmap-de-endurecimiento)
11. [Puntos de integración a verificar](#11-puntos-de-integración-a-verificar)
12. [Build, publicación y registro](#12-build-publicación-y-registro)
13. [Mapa de ficheros](#13-mapa-de-ficheros)

---

## 1. Resumen

mIRC es un **canal de tipo cluster** (no *resourced*: no va atado a pods/containers, vive a nivel de cluster como `news`, `censor` o `pinocchio`). Cuando un usuario arranca mIRC ve un **roster** de los demás usuarios de los Kwirth a los que tiene acceso, etiquetados por cluster, y puede abrir una conversación 1:1 con cualquiera.

Tres garantías de producto:

- **Alcance = tus accessKeys.** Ves y puedes escribir a usuarios de cualquier Kwirth para el que tengas credencial en tu *cluster list*.
- **Entrega offline.** Un mensaje enviado mientras el destinatario está desconectado **no se pierde**: espera en el buzón del back y se entrega al reconectar.
- **Doble-check.** El emisor sabe si su mensaje fue guardado (✓), entregado (✓✓) y leído (✓✓ azul), con `ts` de servidor en UTC.

---

## 2. Decisiones de arquitectura (el porqué)

El diseño pasó por varias iteraciones. Estas son las decisiones clave y la razón de cada una.

### 2.1. ¿Quién habla con quién? → Front-hub, no back-a-back

El problema central es que **dos usuarios no comparten necesariamente un Kwirth**: cada uno se conecta al Kwirth del cluster en el que trabaja. La tentación inicial fue federar los backs (que los Kwirth/los channel-backs se hablen entre sí). Se descartó por **reachability**:

- Un Kwirth donde "trabaja" un usuario puede estar tras firewall, en red privada, NAT, o ser una instancia **desktop** (`isDesktop`, vía Electron/Tauri) **sin ningún endpoint inbound**.
- Con back-a-back, la vuelta del recibo (`back de B → back de A`) exige que el Kwirth de A sea alcanzable desde el de B. Para un desktop **es imposible**: puede hacer POST salientes pero no recibir nada.

La solución es mover el hub al **front**, que tiene la propiedad que faltaba: **siempre es cliente saliente y nunca necesita endpoint inbound**. El front del usuario abre un websocket *hacia* cada Kwirth de su cluster list. Esa "tubería persistente saliente" ya existe en Kwirth (`new WebSocket(cluster.url)`). Así:

- Los **backs no se hablan entre sí**: cada back solo gestiona los fronts colgados de él.
- El **front es lo único que cruza clusters** y, como inicia las conexiones, el desktop/firewall deja de ser problema.

### 2.2. Rendezvous por conversación

No es "un único Kwirth global". Para una conversación A↔B, el punto de encuentro es **el Kwirth donde ambos están presentes** (el back que ambos fronts tienen conectado). Diferentes conversaciones pueden usar diferentes Kwirths simultáneamente. El back de rendezvous es la **fuente de verdad** del mensaje y de sus recibos: como ambos fronts están colgados de él, el ✓✓ vuelve al emisor por su propio ws sin saltos entre servidores.

**Límite asumido:** solo puedes hablar con quien comparte al menos un Kwirth contigo. Si vuestros accesos son totalmente disjuntos, no hay dominio de confianza común y no hay chat — lo cual es razonable.

### 2.3. Buzón en el back vs. historial en el front

Son **dos cosas distintas que no se deben mezclar**:

| | Buzón (back) | Historial (front) |
|---|---|---|
| Dónde | Kwirth de rendezvous, `writeStorage` → ConfigMap/Secret | navegador, `localStorage` |
| Para qué | **entrega offline**: dónde *esperan* los mensajes mientras estás fuera | **recordar**: dónde *guardas* los mensajes que ya tienes |
| Vida | transitorio (se vacía al entregar) | permanente, por dispositivo |

El buzón es **imprescindible** porque un navegador cerrado no corre código ni recibe red: `localStorage` es un cajón pasivo. Lo único vivo y alcanzable mientras estás fuera es el back. Sin buzón, los mensajes enviados mientras estás offline se perderían.

### 2.4. Timestamp de servidor en UTC

El `ts` lo **sella el back de rendezvous** (`new Date().toISOString()`), no el reloj del front. Razón: si cada front pusiera su hora, el *clock skew* entre máquinas desordenaría los mensajes. El back es el punto único por el que pasan ambos extremos, así que su reloj es la autoridad de orden. El front muestra una hora local optimista hasta que llega el ✓ (que trae el `ts` oficial) y entonces ajusta. `msgId` + `ts` oficial son las claves para **reconciliar** historial local + mensajes en vivo + buzón volcado al reconectar.

### 2.5. Doble-check como eventos `msgtype`

El recibo no es polling ni token-por-mensaje: es **otro mensaje** con su propio `msgtype` (`mirc-ack`, `mirc-receipt`), el mismo patrón discriminador que usa `echo`. Como en el modelo front-hub ambos extremos cuelgan del mismo back, el back simplemente empuja el evento al ws del emisor.

---

## 3. Topología

```
                 ┌──────────────────────────────┐
                 │           Front A             │   (navegador / desktop / tauri)
                 │   MircClient: 1 ws por cluster │
                 └───────┬──────────┬───────────┘
              ws (out)   │          │   ws (out)
            ┌────────────┘          └───────────────┐
            ▼                                        ▼
   ┌─────────────────┐                      ┌─────────────────┐
   │  mirc back PRO  │                      │  mirc back PRE  │   ← rendezvous para A↔B
   │  presencia      │                      │  presencia      │
   │  relay local    │                      │  relay local    │
   │  buzón (CM)     │                      │  buzón (CM)     │
   └─────────────────┘                      └───────┬─────────┘
                                                    ▲  ws (out)
                                                    │
                                            ┌───────┴─────────┐
                                            │     Front B      │
                                            │  MircClient      │
                                            └─────────────────┘
```

- A tiene acceso a {PRO, PRE}; B solo a {PRE}. Comparten **PRE**, que es el rendezvous.
- El front A multiplexa: abre ws a PRO y a PRE. El front B abre ws a PRE.
- Ningún back habla con otro back.

---

## 4. Protocolo de mensajes

Todo viaja dentro del envelope estándar `IInstanceMessage` (`channel`, `instance`, `type`, `flow`, `action`) + un discriminador `msgtype` + payload. Definido en `src/common/MircTypes.ts`.

### Estados de un mensaje

```
TMircState = 'sent' | 'delivered' | 'read' | 'failed'
```

### Record canónico

```ts
IMircMessageRecord = {
  msgId: string      // generado por el front emisor; clave de idempotencia y de orden
  from:  string      // nick del emisor
  to:    string      // nick del receptor
  ts:    string      // UTC ISO-8601 sellado por el back (autoridad de orden)
  body:  string
  state: TMircState
}
```

### Front → Back (comandos, `action: 'command'`)

| `msgtype` | Campos | Significado |
|---|---|---|
| `mirc-hello` | `nick` | Anuncia mi nick, pide roster inicial, dispara flush de mi buzón |
| `mirc-send` | `msgId, to, body` | Envío un DM |
| `mirc-read` | `peer, msgIds[]` | Marco como leídos mensajes de `peer` |
| `mirc-roster` | — | (Re)pido el roster |

> Nota: el `hello` práctico va embebido en el `data:{nick}` del START (`addObject`); `mirc-hello` existe para re-anunciar.

### Back → Front (eventos, `flow: 'unsolicited'`)

| `msgtype` | Campos | Significado |
|---|---|---|
| `mirc-roster-data` | `users: IMircUser[]` | Snapshot completo del roster del back |
| `mirc-presence` | `nick, online` | Un usuario cambió de estado |
| `mirc-message` | `record` | DM entrante (en vivo o volcado del buzón) |
| `mirc-ack` | `msgId, ts, state('sent'\|'failed')` | El back aceptó+guardó mi mensaje (**✓**) |
| `mirc-receipt` | `msgId, to, state('delivered'\|'read'), ts` | Cambio de estado de un mensaje que envié (**✓✓** / azul) |
| `mirc-error` | `msgId?, text` | Error |

`IMircUser = { nick, online, cluster? }` — el `cluster` lo rellena el front (el back solo se conoce a sí mismo).

---

## 5. Back: diseño detallado

Fichero: `src/back/index.ts`. Implementa la interfaz `IChannel` del SDK (mismo conjunto de métodos que `echo`).

### 5.1. `getChannelData()`

```
cluster: true        // canal de cluster
resourced: false     // no atado a pods
endpoints: []        // front-hub: cero endpoints back-a-back
websocket: false
requirements: { storage: true, providers: [] }   // storage:true → writeStorage/readStorage
```

### 5.2. Estructuras en memoria

```ts
webSockets: [{ ws, lastRefresh, instances: [{ instanceId, accessKey, nick }] }]
```

Un usuario (nick) puede tener varias instancias/sockets (varias pestañas/clusters). **Presencia = online si al menos uno está vivo.** Helpers: `socketsForNick`, `isOnline`, `allNicks`.

### 5.3. Ciclo de vida

- **Registro (`addObject`)**: los canales cluster llegan aquí cuando el core procesa el START con `view===CLUSTER` (`channel.addObject(ws, instanceConfig, '*all','*all','*all')`). Aquí se: lee el `nick` de `instanceConfig.data`, registra la instancia, marca online (broadcast `mirc-presence`), envía el roster, **vacía el buzón** (`flushMailbox`) y **reproduce recibos pendientes** (`replayOutbox`).
- **Comandos (`processCommand`)**: el core enruta aquí los mensajes con `action:'command'`. Dispatch por `msgtype` → `onHello` / `onSend` / `onRead` / roster.
- **Baja (`removeConnection` / `removeInstance` / `stopInstance`)**: si un nick pierde su última conexión → broadcast `mirc-presence(offline)`.
- **Heartbeat (`refreshConnection`) y reconexión (`updateConnection`)**: reutilizan el mecanismo del SDK.

### 5.4. Envío (`onSend`)

1. Resuelve `from` (nick del emisor por su instancia).
2. **Sella `ts = nowUtc()`** y construye el `record`.
3. Envía **`mirc-ack(sent, ts)`** al emisor → **✓**.
4. Busca sockets del destinatario:
   - **Online** → empuja `mirc-message(delivered)` a cada socket del destinatario y envía **`mirc-receipt(delivered)`** al emisor → **✓✓** *(entregado optimista: al empujar al socket; ver §10)*.
   - **Offline** → hace *append* del record en `mirc.mailbox.<to>` (estado `sent`). El emisor se queda con el ✓.

### 5.5. Leído (`onRead`)

Marca leídos y envía `mirc-receipt(read)` al `peer` (emisor original). Si el emisor está offline, persiste el recibo en su **outbox** (`mirc.outbox.<peer>`) para reproducirlo cuando vuelva.

### 5.6. Flush del buzón (`flushMailbox`)

Al conectar un usuario, lee `mirc.mailbox.<nick>`, le entrega cada record (`mirc-message`), y para cada uno avisa de "entregado" al **emisor original**: si está online, `mirc-receipt(delivered)`; si no, lo aparca en su outbox. Al final **vacía el buzón**.

### 5.7. Replay del outbox (`replayOutbox`)

Al conectar, reproduce los recibos (`delivered`/`read`) que llegaron mientras el usuario estaba offline, y limpia. Así **ningún check se queda colgado**, ni siquiera si el emisor estaba ausente cuando avanzó el estado.

---

## 6. Front: diseño detallado

### 6.1. `MircChannel` (`src/front/MircChannel.ts`)

IChannel del front. `requirements.webSocket = false` porque **`MircClient` gestiona sus propios sockets**. Ciclo: `initChannel` (crea `MircData`, lee el nick de `localStorage['kwirth.mirc.nick']`), `startChannel` (instancia y arranca el `MircClient`; sin nick no arranca → el diálogo de setup lo pide), `stopChannel` (para el cliente). `processChannelMessage` devuelve `NONE` (el cliente alimenta la UI directamente vía `onChange`).

### 6.2. `MircClient` (`src/front/MircClient.ts`) — el motor front-hub

- **`start()`**: lee `localStorage['remoteClusters']` (la *cluster list* que ya persiste el core, con `url` + `accessString`) y abre un ws por cluster habilitado.
- **`openCluster(entry)`**: `new WebSocket(url)`; al abrir envía el **handshake START** de canal cluster (mismo shape que el core front: `{channel:'mirc', view:'cluster', scope:'cluster', accessKey, action:'start', flow:'request', type:'signal', data:{nick}}`).
- **`onMessage`**: el START/RESPONSE trae el `instance` asignado; luego dispatch por `msgtype` (roster, presencia, mensaje, ack, receipt).
- **`send(cluster, to, body)`**: genera `msgId`, hace **echo optimista** en el historial (estado pendiente → icono reloj) y manda `mirc-send` (`action:'command'`).
- **`markRead(cluster, peer)`**: manda `mirc-read` con los `msgId` no leídos.
- **Historial**: `localStorage['kwirth.mirc.history.<cluster>.<peer>']`, **deduplicado por `msgId`** y **ordenado por `ts`**. `updateState` aplica el rango de estados (`failed < sent < delivered < read`) para que un recibo nunca retroceda.
- **Vistas para la UI**: `getRoster()` (fusiona el roster de todos los clusters, etiqueta por nombre de cluster, excluye tu propio nick, ordena online primero), `getConversation(cluster, peer)`.

### 6.3. UI (`src/front/MircTabContent.tsx`)

Una sola ventana: panel izquierdo con el roster (avatar + punto online/offline + chip de cluster), panel derecho con la conversación (burbujas, propias a la derecha, `ts` formateado, y el componente `Ticks`). `Ticks` renderiza: pendiente → reloj; `sent` → ✓; `delivered` → ✓✓ gris; `read` → ✓✓ azul. Se suscribe a `client.onChange` para re-renderizar.

---

## 7. Esquemas de almacenamiento

### Back (`writeStorage`/`readStorage`, ConfigMap/Secret)

| Clave | Contenido |
|---|---|
| `mirc.mailbox.<nick>` | `IMircMessageRecord[]` — cola de pendientes de entrega para ese usuario |
| `mirc.outbox.<nick>` | `IPendingReceipt[]` — recibos (`delivered`/`read`) pendientes de entregar a ese emisor |

> Límite de ConfigMap ~1 MiB. Las colas son **transitorias** (se vacían), no un archivo, así que en la práctica quedan acotadas. Para histórico voluminoso, ver §10.

### Front (`localStorage`)

| Clave | Contenido |
|---|---|
| `kwirth.mirc.nick` | tu nick |
| `kwirth.mirc.history.<cluster>.<peer>` | `IUiMessage[]` (recortado a 500) |
| `remoteClusters` | *(propiedad del core)* la cluster list que el cliente lee |

---

## 8. Flujos paso a paso

### 8.1. A escribe a B (B online)

```
A.front --mirc-send-->        back(PRE)              B.front
                       ack(sent, tsUTC)   -->  A   [✓]
                       mirc-message(delivered) --> B.front
                       receipt(delivered)  -->  A   [✓✓]
B abre la conversación:
B.front --mirc-read-->         back(PRE)
                       receipt(read)       -->  A   [✓✓ azul]
```

### 8.2. A escribe a B (B offline) + recuperación

```
A.front --mirc-send-->  back(PRE): no hay socket de B
                        -> append mailbox.B (state=sent)
                        -> ack(sent) --> A   [✓]   (sin ✓✓ todavía)

... B arranca mIRC más tarde ...
B.front --START(addObject)--> back(PRE)
                        flushMailbox(B): mirc-message(delivered) --> B.front
                        receipt(delivered): si A online --> A [✓✓]
                                            si A offline --> outbox.A (replay al volver)
```

### 8.3. Reconexión del emisor

Al volver A: `addObject` → `replayOutbox(A)` reproduce los `delivered`/`read` que ocurrieron mientras estaba fuera. El historial local de A se reconcilia por `msgId` + `ts`.

---

## 9. Identidad y seguridad

- **Identidad v1 = nick elegido** (`localStorage`), anunciado en el handshake. Es la opción más fiel al espíritu mIRC y 100% plugin-local.
- **Riesgo: spoofing de nick.** Cualquiera puede anunciarse con el nick de otro. El **endurecimiento** es atar la identidad a la del auth (resolver `accessKey → username` contra `kwirth-users`, o el `sub` de Keycloak) en el back, e ignorar el nick declarado.
- **Alcance** lo gobierna la accessKey: solo te conectas a Kwirths para los que tienes credencial. El back valida la accessKey en el START (como cualquier canal).

---

## 10. Simplificaciones de v1 y roadmap de endurecimiento

| Simplificación v1 | Endurecimiento |
|---|---|
| Identidad = nick declarado | Atar a identidad de auth (resolver `accessKey`→usuario); ignorar nick spoofeado |
| Roster = usuarios vistos/online | Enumerar el **directorio completo** `kwirth-users` (leer el Secret vía `clusterInfo.coreApi`) para listar también a offline nunca vistos |
| **Entregado optimista** (al empujar al socket) | Esperar **ack explícito** del front receptor antes de marcar `delivered` |
| Historial en `localStorage` (~5–10 MB) | Migrar a **IndexedDB** para volúmenes grandes |
| Sin cifrado de cuerpo | E2E o, al menos, no persistir cuerpos en buzón más de lo necesario |
| Sin paginación de historial | Lazy-load por conversación |
| Idempotencia básica por `msgId` | Reintentos del front + dedup robusto en el back |

---

## 11. Puntos de integración a verificar

Esto se construyó leyendo el SDK (`echo` como plantilla) y **bundlea limpio con esbuild**, pero no se ha type-checked contra los `.d.ts` reales ni probado en el front vivo. Revisa:

1. **`tsc` contra los paquetes reales** `@kwirthmagnify/kwirth-common*`. Inferí: campos exactos de `IChannelRequirements`, `ISetupProps`, y que existe `EInstanceConfigScope.CLUSTER` (si el miembro se llama distinto, salta al instante).
2. **Acoplamiento a `remoteClusters`**: `MircClient` lee esa clave de `localStorage` y replica el handshake START. Si el formato de la entrada de cluster difiere (campos `url`/`accessString`/`enabled`), ajústalo en `IClusterEntry`.
3. **ws de tab del core**: con `webSocket:false` se asume que el core **no** abre además su propio ws de tab para mirc. Si lo abre, es un **registro duplicado inofensivo** (otra conexión para el mismo nick); si molesta, suprímelo o úsalo en lugar de uno de los de `MircClient`.
4. **Estado `delivered` optimista**: hoy se marca al empujar al socket. Si quieres semántica estricta, mete el ack del receptor.

---

## 12. Build, publicación y registro

```bash
cd plugins/mirc
npm install
npm run build          # genera dist/front.js, dist/back.js, dist/package.json
# publicar el paquete:
cd dist && npm publish
```

Registro (lo haces tú a mano): añade una entrada en `plugins/manifest.json`:

```json
{
  "id": "mirc",
  "version": "0.1.0",
  "name": "mIRC",
  "url": "https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-mirc/-/kwirth-plugin-mirc-0.1.0.tgz",
  "description": "mIRC channel plugin for Kwirth - cross-cluster direct messaging",
  "icon": "Forum"
}
```

El core carga el plugin dinámicamente (front inyectado desde `…/plugins/mirc/front`, back por su loader). **No hay cambios en el código fuente del core.**

---

## 13. Mapa de ficheros

```
plugins/mirc/
├── package.json            # metadata + deps (mismas que echo)
├── tsconfig.json           # copiado de echo
├── build.mjs / watch.mjs   # esbuild: externaliza React/MUI/kwirth como globals
└── src/
    ├── common/
    │   └── MircTypes.ts     # protocolo compartido front/back (envelope + msgtype + record)
    ├── back/
    │   └── index.ts         # MircChannel: presencia, relay, buzón, outbox, doble-check, ts UTC
    └── front/
        ├── index.ts         # registra window.__kwirth_plugins__['mirc']
        ├── MircChannel.ts   # IChannel del front (lifecycle)
        ├── MircClient.ts    # motor multi-cluster + historial local + doble-check
        ├── MircConfig.ts    # config + instanceConfig (nick)
        ├── MircData.ts       # estado por pestaña (client, nick, selección)
        ├── MircSetup.tsx    # diálogo de nick + icono
        ├── MircTabContent.tsx # la ventana de chat (roster + conversación + checks)
        └── MircTypes.ts     # re-export de common + IMircInstanceConfig
```

---

*Versión del documento: para mirc 0.1.0. Las decisiones de §2 reflejan el razonamiento que llevó al modelo front-hub; consérvalas como contexto si alguien propone volver a federar los backs (la razón de no hacerlo es la reachability del desktop, §2.1).*
