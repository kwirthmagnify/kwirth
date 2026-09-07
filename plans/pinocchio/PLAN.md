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
      Añadir pinocchio al watch permanente o dejar claro que se construye a mano.
