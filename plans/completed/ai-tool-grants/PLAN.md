# Concesión de AI toolsets por tool — PLAN

> **ESTADO — ✅ CERRADO** (2026-11-11). Cuelga de [PRD.md](PRD.md); el qué y el por qué están allí. Aquí,
> el cómo. Entregado: `kwirth-common-ai@0.5.79`, core (back + front) y `plugin/pinocchio@0.3.2`.
>
> - **T1** ✅ `common-ai@0.5.79` publicada: 77/77 tests.
> - **T2** escrito: back 881 tests, 0 fallos. Además, `GET /core/aitoolsets` devuelve `grantCount` para el
>   chip de la tarjeta.
> - **T3** ✅ e2e 11/11 (4 de pinocchio saltados: no está instalado en este dev). **QA validada** (2026-11-11).
> - **T4** ✅:
>   - pinocchio `0.3.2` publicada: `common-ai@^0.5.79` y `TOOLS NOT GRANTED [...]` en su traza (`front.js`
>     idéntico; `common-ai` no va dentro del bundle, la recibe del core como todos).
>   - Consumidores (CL9 punto 6): **ninguno afectado**. Ningún plugin lee ni escribe concesiones; agora solo
>     usa `resolveTools`, y `notGrantedTools` es aditivo.
>   - 📌 `plugin/pinocchio@0.3.1` está publicada en npm pero **sin tag** en git (hallazgo, no se toca).
>   - Guía y changelog escritos. Captura nueva `aitoolset-grant.png` (toolset público, filas filtradas contra el
>     manifest público). ⚠️ `manage-aitoolsets.png` **no** se regenera: en este dev saldrían los toolsets
>     de marketplaces privados, así que se mantiene la anterior, que no enseña el chip de plugins.
>
> ⚠️ **Cambio respecto a lo validado** (usuario, 2026-11-11, durante T1): existe el **switch "All"** por
> plugin = todas las tools, también las futuras. El tipo lleva `allTools: boolean` (ver PRD, decisiones 1 y 2).

## Streams

Tres streams de código y uno de cierre. T1 y T2 no tienen UI: **se prueban y se cierran con T3**, que es el
que la trae. Un solo rebuild del front, al final de T3.

### T1 — `common-ai`: el registro concede tools

- `index.ts`: `IToolsetGrant { pluginId: string, tools: string[] }` (validado en el PRD).
- `back.ts`:
  - `toolsetGrants` pasa de `Map<toolsetId, Set<pluginId>>` a `Map<toolsetId, Map<pluginId, Set<toolName>>>`.
  - `setToolsetGrants(toolsetId, grants: IToolsetGrant[])` y `getToolsetGrants(toolsetId): IToolsetGrant[]`
    cambian de firma. Una entrada con `tools: []` se trata como **no concedida** (no se guarda en memoria).
  - `isToolsetGrantedTo(toolsetId, pluginId)` se mantiene: cierto si tiene **al menos una** tool concedida.
  - Nuevo `isToolGrantedTo(toolsetId, toolName, pluginId)`.
  - `resolveTools`: con `requesterId`, una tool no concedida se salta **antes** de mirar la sombra (no hace
    sombra) y su ref va a `IToolResolution.notGrantedTools` (nuevo). Sin `requesterId` no se filtra, como hoy.
  - `invokeToolRef`: comentario de que **no es una puerta** (no recibe solicitante; no lo usa ningún
    consumidor). No se le cambia la firma.
- Tests en `tests/resolution.test.mjs`, con valores: concedida parcial, `[]`, no hace sombra, tool
  concedida que ya no existe (se ignora), sin `requesterId`.
- Publicar `0.5.79` (tarball antes, GET después).

### T2 — back: persistencia, API y portabilidad

- `AiToolsetManager`:
  - `TToolsetGrants = Record<string, IToolsetGrant[]>`.
  - 🔴 **Sin migración**, pero sin romper: al leer el ConfigMap, una entrada que no tenga la forma nueva
    (p. ej. el `string[]` antiguo) **se descarta con un `logWarning`**. No se convierte.
  - `setGrants(toolsetId, grants)`: valida que cada `tools[]` nombra tools que **existen** en el toolset
    registrado (si no, error → 400). Deduplica plugins y tools. Guarda también las entradas con `[]`
    (mismo criterio de auditoría que hoy).
  - `restoreGrants` / `applyGrants`: con el tipo nuevo; las tools huérfanas (desaparecidas en una versión
    nueva) se quedan en el ConfigMap, se ignoran en el registro y se loguean.
- `AiToolsetApi`:
  - `GET /core/aitoolsets/grants` → `Record<toolsetId, IToolsetGrant[]>`.
  - `PUT /core/aitoolsets/grants/:id` con body `{ grants: IToolsetGrant[] }` (admin, como hoy).
- `CoreManagedConfig.toolsetGrants`: export/import con el formato nuevo; el aviso de plugins no instalados
  se mantiene y se añade el de tools que no existen en destino.
- Tests del back sobre `setGrants` y la lectura que descarta el formato antiguo.

### T3 — front: diálogo de concesión

- `AiToolsetGrantDialog.tsx` (nuevo, en `front/src/components/extensions/`): la matriz plugins × tools del
  PRD, con el switch "All" por fila (`allTools`: todas, también las futuras; con él encendido las casillas
  salen marcadas y bloqueadas), chip de *effect* por columna, columnas de
  ancho fijo, scroll dentro, Help/Cancel/Save. Tools huérfanas de la concesión guardada: columna marcada
  como *"no longer in this toolset"*, que se pierde al guardar.
- `AiToolsetDescriptor.ts`: **fuera `pluginSelector`**, dentro `renderConfigDialog` (el engranaje del
  gestor genérico) que abre el diálogo. Chip de la tarjeta: `N plugins` concedidos.
  `ExtensionManagerDialog` y `PluginMultiSelect` **no se tocan** (los sigue usando themes).
- `App.tsx`: `loadToolsetGrants`/`saveToolsetGrants` con el tipo nuevo. Las tools de cada toolset salen del
  catálogo que ya existe (`GET /core/aitoolsets/catalog`, `IAiToolsetInfo.tools`).
- `front/package.json` → `kwirth-common-ai@^0.5.79`.
- E2E: actualizar `aitoolsets-manager.spec.ts` y `pinocchio-toolsets.spec.ts` (concesión parcial → solo esas
  tools llegan a pinocchio). No destructivo: afterAll restaura solo lo leído.
- QA: aquí se valida T1+T2+T3.

### T4 — cierre

- **pinocchio**: su `toolsAvailable` ya sale de `resolveTools(…, PINOCCHIO_ID)`, así que las tools no
  concedidas simplemente no aparecen; no hace falta pintarlas en gris (el PRD se corrige en esto). Solo
  subir `kwirth-common-ai` y republicar, añadiendo `notGrantedTools` a su traza de resolución.
- **agora** (de pago): se avisa del cambio de firma y de `notGrantedTools`; no se toca desde aquí.
- Guía: `guide/extensions/aitoolsets` — sección del gestor, con captura del diálogo nuevo.
- Notas de versión: las concesiones se pierden al actualizar y hay que rehacerlas.
- CL9.

## Riesgos

- **Cambio de firma en `common-ai`** (`setToolsetGrants`/`getToolsetGrants`): cualquier consumidor que las
  llame rompe. Hoy solo el core; se verifica con grep en T1.
- **Bundles de plugins con `common-ai` dentro**: si un plugin lleva su propia copia del registro, no vería
  las concesiones del core. Se comprueba en T4 antes de republicar pinocchio.
