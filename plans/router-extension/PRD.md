# Router — un tipo de extensión para llegar a clusters sin camino directo — PRD

> Documento de producto. Describe qué tiene que pasar, no cómo se programa; el PLAN con los streams
> cuelga de este PRD y se escribe cuando esté validado.
> Estado: **validado** (2026‑11‑15): D1–D14 cerradas; abiertos solo los del §10.

## 0. Resumen

Hoy el core sabe llegar a un cluster **sin camino directo** (entradas *proxied* de la lista de clusters, tickets de
ruta, WebSockets por ruta), pero esa capacidad **cuelga de los canales**: solo un *plugin* puede ser quien lleva el
tráfico, y el contrato está repartido entre `BackChannelData`, `IChannel` y comentarios. Un desarrollador que no
conoce el plugin que lo usa no tiene forma de entender para qué sirve ni de escribir el suyo.

Este PRD crea un **tipo de extensión nuevo, `router`**: una pieza **solo de back**, como un provider, cuyo único
oficio es **llevar el tráfico del core hasta un cluster que no se alcanza directamente**. Se configura con el
diálogo genérico del gestor de extensiones, escribe en el log del core y nada más. Un plugin que además sea router
es un **pluter** (como un pluvider es un plugin que además es provider).

**Criterio de éxito:** un desarrollador OSS, leyendo solo el contrato `IRouter`, su scaffolder y el router de
referencia **`bridge`** (anexo A), escribe un router que funciona, sin abrir el código de ningún plugin.

## 1. El problema

1. **Acoplamiento.** El routing vive en los canales: `BackChannelData.clusterRouteResolver`,
   `IChannel.pathWebsocketRequest`, el montaje en `/channel/<routerAlias>`, y el front sacando el ticket de ruta
   **arrancando el canal** del resolver (`front/src/tools/RouteTickets.ts`). Un router obliga a escribir un plugin
   entero —front, instancias, pestaña— aunque solo quiera mover bytes.
2. **Opacidad.** No hay un tipo, ni un scaffolder, ni un ejemplo abierto. El único usuario real es de pago; los
   comentarios del core que lo explican lo nombran, y un desarrollador OSS no tiene acceso a él.
3. **El ticket lo emite quien no debe.** Autenticar es del core; hoy el ticket lo emite el canal (cada router
   reimplementaría la validación de sesiones).
4. **Instalar o quitar exige reiniciar.** Un router se monta en Express al arrancar y no se puede desmontar.

## 2. Objetivo

- Un tipo **`router`** con su contrato (`IRouter`), su gestor en el front, su scaffolder y su router de referencia.
- El **core** autentica (emite y valida los tickets de ruta) y **entrega** al router el tráfico ya autenticado,
  con quién es; el router **autoriza** y lo lleva.
- Instalar, actualizar y desinstalar un router **sin reiniciar** Kwirth.
- Cero nombres de extensiones concretas en el core.

### No objetivos

- Definir **cómo** un router transporta el tráfico (túnel, VPN, bastión…): es de cada router.
- Federación, mallas, hubs: son de cada router (un pluter de pago puede hacerlo; `bridge` no).
- UI propia de un router (panel, pestaña): eso es un pluter.

## 3. Concepto

```
  navegador / back del core A                      core A                         cluster B (sin camino)
  ─────────────────────────────                    ──────                         ──────────────────────
  entrada de la lista: url REAL de B        ┌────────────────────────┐
  + route { router: 'bridge', clusterUid }  │ /router/bridge/...      │   el router lleva    ┌──────────┐
  ── fetch / WebSocket ───────────────────► │  1. core valida ticket  │ ───────────────────► │ Kwirth B │
                                            │  2. entrega a IRouter   │   (cómo: suyo)       └──────────┘
                                            └────────────────────────┘
```

- **Router**: extensión de back que **resuelve rutas**. Declara su `IRouterData` (id, plantilla de la ruta, si
  necesita ticket) y recibe las peticiones HTTP y los WebSockets que llegan a `<rootPath>/router/<id>/...`.
- **Ruta** (`IClusterRoute`, ya existe): lo que guarda una entrada de la lista de clusters además de su url real:
  qué router la resuelve y el uid del cluster destino.
- **Ticket de ruta**: credencial corta que viaja **en la url** (un navegador no pone cabeceras a un `WebSocket`).
  **La emite y la valida el core.**
- **Pluter**: `IChannel & IRouter`. Un plugin con panel que además es router. La presencia de `getRouterData()` lo
  declara, igual que `getPluviderData()` declara un pluvider.

## 4. Casos de uso

1. **Dos Kwirths hermanos** (anexo A, `bridge`): A alcanza a B pero B no alcanza a A (NAT). Con el enlace que A
   abre hacia B, cada uno ve al otro en su lista de clusters.
2. **Bastión / proxy corporativo**: un router que lleva el tráfico por un SSH o un HTTP CONNECT.
3. **Un pluter de pago** (hub & spoke, malla): mismo contrato, con su panel.

## 5. Requisitos funcionales

**R1 · Tipo y gestor.** `EExtensionType.ROUTER = 'router'`. Gestor propio en el menú (el decimotercero), con el
`ExtensionManagerDialog` genérico: instalar, actualizar, desinstalar, configurar. Marketplace en `routers/`.

**R2 · Contrato `IRouter`** (common-back). Lo mínimo para escribir un router (nombres a validar, §D2):
- `getRouterData(): IRouterData` — `{ id, pathTemplate, needsTicket }` (lo que hoy es `IClusterRouteResolver`).
- `router?: Router` — HTTP bajo `<rootPath>/router/<id>/`.
- `routerWebsocket?(ws, req, caller)` — un WebSocket bajo la misma ruta (sale de `IChannel.pathWebsocketRequest`).
- `startRouter(config)`, `applyConfig(config)`, `stopRouter()` — con la config ya leída por el core.
- `getConfigSchema()` — los campos del diálogo (`IConfigFieldDef`, el mismo esquema que los providers).
- `getScopeCatalog?()` — los scopes que declara (p. ej. `bridge$peer`), para el editor de seguridad.
- `setLogger(logger)` — sus mensajes van al log del core, componente `ROUTER`.

**R3 · Configuración.** Diálogo **genérico** (`ConfigFormDialog`) dibujado desde `getConfigSchema()`. Se guarda en
un **Secret** (`kwirth-router-<id>-config`): lleva credenciales. El `GET` devuelve los valores **reales** y el diálogo
los muestra enmascarados con el ojo (regla del proyecto). Guardar llama a `applyConfig()` **en caliente**.

**R4 · Montaje sin reinicio.** El core monta **un solo despachador** `<rootPath>/router/:id` (HTTP) y deriva los
upgrades de WebSocket de esa ruta, y en cada petición busca el router vivo por id. Instalar, actualizar o quitar
un router cambia la tabla, no Express → **`requiresRestart: false`**.

**R5 · Tickets del core.** El front pide el ticket al core (`POST /core/routes/ticket`, con su credencial de sesión);
el core lo firma, con caducidad corta, y lo renueva antes de que caduque. En cada petición a `/router/<id>/…` el core
**valida el ticket** y entrega al router un `IRouteCaller` (quién es: usuario y access key ya validados). El ticket
`loopback` (el back del core llamándose a sí mismo por la ruta) se mantiene, solo desde loopback.

**R6 · Lista de clusters.** El selector de ruta de *Manage clusters* lista los **routers** instalados (hoy lista
canales). Una entrada con un router que ya no está se mantiene y se dice "(not installed)", como hoy.

**R7 · `openRemoteChannel` por ruta.** El back resuelve el endpoint de una entrada con ruta contra los routers (hoy
contra los canales), igual que ahora.

**R8 · Pluter.** Un plugin que implementa `IRouter` es router con su id de canal. El core lo trata en las dos
facetas sin duplicar nada.

**R9 · Consola.** Un router solo se expresa en el log del core (con su componente) y en el estado del gestor
(instalado, configurado, arrancado, último error). Sin pestaña.

**R10 · Scaffolder.** `tools/create-kwirth-router.mjs`: genera un router que compila, con esquema de config, un
scope y un `router` HTTP de eco, y su README explicando el contrato.

## 6. Qué implica en el core

| Dónde | Cambio |
|---|---|
| common | `EExtensionType.ROUTER`; `IRouterData` (sustituye a `IClusterRouteResolver`); `resolveClusterRouteUrl` construye `/router/<id>`; `ERouteOwnerKind.ROUTER` |
| common-back | `IRouter`, `IRouteCaller`; **se quitan** `IChannel.pathWebsocketRequest` y el resolver de `BackChannelData` |
| back | `RouterManager` (instalar/cargar/config en Secret), `RouterApi` (`/core/routers`), despachador HTTP+WS, emisión y validación de tickets, `openRemoteChannel` contra routers; las listas por tipo (Marketplace, Pack, ExtensionDeps, ExtensionRefs, `kwirth-dev.json` `"routers"`) |
| front | `RouterDescriptor` + gestor en el menú; `ClusterRouting`/`RouteTickets` piden el ticket al core; *Manage clusters* lista routers |
| tools | `create-kwirth-router.mjs` |
| comentarios | los dos que nombran una extensión concreta (`IBackChannelObject.kwirthVersion`, `back/src/index.ts`) pasan a ser genéricos |

## 7. Decisiones

| # | Decisión | Propuesta |
|---|---|---|
| **D1** | Nombre del tipo | `router` (`EExtensionType.ROUTER`); un plugin que además lo es, **pluter** |
| **D2** | Tipos nuevos | `IRouter`, `IRouterData` (sustituye a `IClusterRouteResolver`), `IRouteCaller` en common-back/common — validados 2026‑11‑15 |
| **D3** | Ruta de montaje | `<rootPath>/router/<id>`; desaparece el uso de `/channel/<alias>` para rutas de cluster (el `routerAlias` de canal sigue existiendo para URLs estables, que es otra cosa) |
| **D4** | Quién emite el ticket | **El core** (autentica); el router recibe `IRouteCaller` y **autoriza** |
| **D5** | Configuración | Esquema genérico + **Secret**; valores reales al front, enmascarados con ojo; `applyConfig` en caliente |
| **D6** | Reinicio | **No**: despachador único con tabla viva |
| **D7** | Migración | Se **quita** el routing de los canales en la misma versión (sin convivencia): su único usuario es un pluter de pago sin clientes en producción, que se migra a la vez |
| **D8** | Scopes de un router | Los declara él (`getScopeCatalog`), como un canal; un router sin scopes se usa solo con `admin` |
| **D9** | Log | Componente `ROUTER` en el log del core, con el id del router |
| **D10** | Marketplace | Carpeta `routers/` en cada manifest |
| **D11** | Varias instancias | Un router instalado = **una** instancia (como un provider) |
| **D12** | Dependencias | Un router puede `requires` providers (`IExtensionRequirements`); un plugin puede `requires` un router |
| **D13** | Router de referencia | **`bridge`**, OSS (`@jfvilas/kwirth-router-bridge`), anexo A |
| **D14** | Estado en el gestor | Instalado · configurado · arrancado · último error (lo que el router informe) |

## 8. Riesgos y lo que hay que decir en voz alta

- **Cambio incompatible** para el único pluter existente (D7). Asumible hoy; mañana no lo sería.
- **El core pasa a firmar tickets**: es superficie de seguridad nueva (caducidad, rotación de la clave de firma,
  reutilización). Se diseña en el PLAN con tests de abuso.
- **Un router lleva tráfico autenticado como el usuario**: un router malicioso puede hacer lo que el usuario. Igual
  que un plugin hoy; se dice en la guía.
- **Desmontar sin reiniciar** depende de que el despachador sea la única entrada: cualquier montaje directo de un
  router rompería la promesa.

## 9. Criterios de aceptación

1. Se instala `bridge` desde el gestor de **Routers**, se configura en su diálogo y funciona **sin reiniciar**.
2. Con `bridge` en A y B, la lista de clusters de A muestra B como entrada con ruta y todo Kwirth (canales con
   WebSocket incluidos) funciona contra B; y al revés.
3. Desinstalarlo corta el tráfico y la entrada dice "(not installed)", sin reiniciar.
4. El scaffolder genera un router que compila y responde.
5. `grep` de nombres de extensiones concretas en common*, back/src y front/src: nada.
6. El pluter de pago, migrado, pasa su QA.

## 10. Abierto

- Formato del ticket (firma HMAC del core con clave en Secret vs. token opaco en memoria) — PLAN.
- ¿El estado de un router (D14) se pide por un método (`getStatus()`) o se deduce del log? Propuesta: método opcional.

---

## Anexo A · `bridge`, el router de referencia (OSS)

> Su PRD propio vivirá en su repo (`jfvilas/kwirth`, `routers/bridge/docs/plan/PRD.md`). Aquí, lo que el core
> necesita saber de él.

**Qué es.** Un router que une **exactamente dos Kwirths como hermanos**: no hay hub ni spoke; cada uno es a la vez
origen y destino del otro.

**Cómo se monta.**
1. En **B** se instala `bridge` y se crea una access key con el scope **`bridge$peer`**.
2. En **A** se instala `bridge` y en su diálogo se pone la **URL de B** y **esa key** (enmascarada, con ojo).
3. A abre un enlace saliente (WebSocket) hacia `/router/bridge` de B. Con ese único enlace **los dos** se ven: A
   llega a B, y B llega a A por el mismo enlace aunque A esté detrás de NAT.
4. En la lista de clusters de cada uno, el otro se da de alta con ruta `bridge` y su uid.

**Config** (diálogo genérico): `peerUrl` (texto), `peerAccessKey` (password), `reconnectSeconds` (número, 10).
Sin peer configurado, solo acepta.

**Lo que no hace.** Más de un hermano, panel, auditoría. Solo **mensajes de consola**: enlace arriba/abajo,
rechazos, reintentos.

**Decidido (2026‑11‑15):** si los dos se configuran el uno al otro, queda **un solo enlace**: el que abre el
uid menor. El túnel **multiplexa HTTP y WebSockets sobre un solo WebSocket**.
