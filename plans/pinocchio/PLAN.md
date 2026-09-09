# Pinocchio — plan / backlog

Plugin **público** (free). Canal de análisis agéntico: escucha eventos (`events`, `business`, `metrics`),
dispara **triggers** y devuelve *findings* + informe generados por un LLM.

Su configuración de IA **no es suya**: providers y LLMs viven en el almacén común de Kwirth
(`kwirth-store-common-kwirth-ai-providers` en Secret, `kwirth-store-common-kwirth-ai-llms` en ConfigMap) y se
comparten con el resto de plugins con IA. Pinocchio los lee al arrancar el canal y los edita con los diálogos
`AiConfigProvider` / `AiConfigLlm` de `kwirth-common-ai`.

## Estado

- **0.2.31 (2026-09-07)** — paridad con el catálogo de providers del core. Ver
  [test-metrics-history](../../plugins/pinocchio/docs/plan/test-metrics-history.md).
- **2026-09-08** — guía de usuario + admin en `plugins/pinocchio/docs/guide/` (14 páginas + 12 capturas,
  docsify). `build.mjs` y `watch.mjs` empaquetan también `docs/pinocchio.tgz` (extensión `docs`), y el
  tarball está dado de alta en `back/kwirth-dev.json`. Capturas regenerables con
  `playwright test --config playwright.capture.config.ts capture-pinocchio-guide.spec.ts` (front/e2e).
- **2026-09-08** — botones de ayuda (`?`) en la cabecera del canal y en los 5 diálogos propios, cada uno a
  SU sección de la guía. Cubierto por `front/e2e/tests/pinocchio-help.spec.ts` (6 tests: comprueban la URL
  que abre cada botón, no sólo que el botón exista).
  ⚠️ Los diálogos de **AI providers / AI models** NO llevan `?`: son `AiConfigProvider`/`AiConfigLlm` de
  `kwirth-common-ai`, compartidos con los demás plugins, y una sección de la guía de pinocchio no pinta ahí.
  Si se quiere ayuda en ellos, el sitio es la docu del core.
- **2026-09-08** — el refactor del menú Config a grupo plegable **AI** (`AI providers` / `AI models`) había
  dejado obsoletos `pinocchio-ai-config.spec.ts` y `pinocchio-ai-provider-roundtrip.spec.ts` (buscaban
  `Provider`/`LLM`): arreglados. ⚠️ Las primeras capturas de la guía salieron con el menú VIEJO porque el
  core servía el `dist/front.js` rancio (ver el punto del watch, más abajo); regeneradas.

## Hallazgos de la documentación (2026-09-08)

Verificados contra el código al escribir la guía. Todos están recogidos en
`docs/guide/admin/06-limits.md`; ninguno se ha tocado.

- [ ] **`action` no implementado.** El selector ofrece `inform`/`cancel`/`repair` y se persiste, pero el
      backend nunca lee `version.action`. Todo se comporta como `inform`. O se implementa, o se quita de la UI.
- [ ] **`providerOptions` se elige por el `name` del provider, no por su `type`.** `buildModel` usa
      `prov.type` (correcto), pero el `switch` de `buildModelInvocation` usa `llm.provider`, que es el nombre.
      Un provider `google` renombrado a `gemini-prod` pierde `structuredOutputs: true`. **Bug real**, arreglo
      de una línea: resolver el provider y usar su `type`.
- [ ] **Prompts `business` con contexto vacío.** Se construye `nunjucksObj` a partir de `version.spaces` y
      luego se llama a `renderString(prompt, {})`: el objeto calculado se descarta. Las variables no llegan.
- [ ] **Los triggers `business` ignoran `version.system`.** Se usa un system fijo hardcodeado.
- [ ] **`version.spaces` no filtra.** Todos los triggers `business` activos se disparan con cualquier evento
      de negocio; el único filtro real es la suscripción del canal (fijada a `customers.status`,
      `branches.status`, `launch.immediate`).
- [ ] **`hardened_yaml` se pide, se paga y no se muestra.** Está en el schema zod y se guarda en el
      `IAnalysis`, pero ninguna pantalla lo pinta (y ni siquiera está declarado en la interfaz `IAnalysis`).
      O se pinta, o se saca del schema.
- [ ] **Playground: `Export → New trigger` pierde `kind` y `k8sEvent`.** El trigger exportado no casa con
      ningún evento hasta editarlo a mano.
- [ ] **Playground: el selector `K8s Event` no hace nada.** `executePlayground` inyecta siempre `ADDED`.
- [ ] **Playground: el `promptType` elegido se ignora en modo artifact.** Se deriva de si `prompt` está vacío.
- [ ] **Sin filtro read-only en las tools.** `autoTools` entrega el catálogo completo, tools de escritura
      incluidas (`delete_pod`, `restart_deployment`, `add_node`…), ejecutadas con el SA del backend.
      `common-ai` ya tiene `selectAgentToolNames` con `readOnly`: sería reutilizable.
- [ ] **`medium` se pinta en verde** en `PinocchioTabContent.color()`.
- [ ] **`promptType: jinja` no adjunta el objeto — sólo lo usa como contexto de interpolación.** El modelo
      recibe únicamente el texto renderizado. Como `jinja` es el valor por defecto del editor, el prompt
      natural ("Audita el Deployment {{ metadata.name }}") produce un análisis inútil: el modelo contesta
      pidiendo el manifiesto. **Verificado en vivo** al capturar la guía (ver `images/playground-out.png`).
      Opciones: exponer el objeto como variable explícita (`{{ object | dump }}`) y decirlo en la UI, o
      anexar el manifiesto al prompt jinja igual que hace la ruta `artifact`.

## Backlog

- [ ] **Refresco en caliente del AI config.** Hoy el canal lee providers/LLMs **solo al arrancar** (START).
      Si el usuario crea un provider desde los menús *AI Providers* del core con el canal ya abierto, no lo ve
      hasta reabrirlo. Falta un push del core, o un re-read al abrir el diálogo.
- [ ] **AI config y multi-cluster.** Los menús *AI Providers / AI Models* escriben en el backend **local**,
      pero un canal abierto contra otro Kwirth lee el almacén de **ese** cluster. Con federación, la config de
      IA no viaja. Decidir si se replica, si se federa o si se documenta como límite.
- [ ] **Quitar los ficheros que solo re-exportan** (`src/back/PinocchioConfig.ts`,
      `src/front/PinocchioConfig.ts`, `src/back/Utils.ts`) e importar de `src/common` / `kwirth-common-ai`
      directamente. Toca imports en casi todos los ficheros del plugin → refactor aparte.
- [ ] **Harness propio.** El plugin no tiene tests unitarios; hoy todo lo cubre el e2e del core
      (`front/e2e/tests/pinocchio-*.spec.ts`). Candidatos a extraer y testear en aislamiento: el render de
      prompts con nunjucks y el parseo/normalizado de la respuesta del modelo (`IAnalysis`, findings, PSS).
- [ ] **`watch.mjs` no estaba corriendo.** El `dist` llevaba desde el 31-jul mientras las deps se movían.
      Añadir pinocchio al watch permanente o dejar claro que se construye a mano. (Desde 2026-09-08 el watch
      cubre también la guía; el `PINOCCHIO_NO_DOCS_WATCH=1` la desactiva.)
- [ ] **Capturas que faltan en la guía.** Las de findings (lista, detalle de finding, detalle de análisis y
      Report) no se pueden hacer sin un análisis REAL de un trigger `artifact`: exigen persistir un trigger
      en la config del usuario y provocar un evento en el clúster. Se dejaron fuera a propósito. Cuando se
      hagan, van en `user/05-findings.md`, y `user/02-ui-tour.md` debería cambiar `ui-tab.png` (hoy sale el
      canal vacío) por una con análisis.
- [ ] **README del plugin.** `plugins/pinocchio/` no tiene `README.md`, a diferencia del resto de artefactos.
