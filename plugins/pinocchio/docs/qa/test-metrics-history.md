# Pinocchio — histórico de métricas de test

> Registro **incremental** de la suite de tests, una fila por **CL9 / tag**. Se **añade** una fila arriba en
> cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test`. Pinocchio **no tiene harness propio**: su back es
>   orquestación sobre `kwirth-common-ai` (que sí tiene el suyo) y su front es React. La cobertura real la
>   da el e2e.
> - **e2e** = specs y casos en `front/e2e/tests/pinocchio-*.spec.ts` (viven en la suite del **core**, no en el
>   plugin, porque necesitan Kwirth entero levantado). Se lanzan con
>   `playwright test tests/pinocchio-ai-config.spec.ts tests/pinocchio-ai-provider-roundtrip.spec.ts`.
> - Las capturas de la guía se regeneran con
>   `playwright test --config playwright.capture.config.ts tests/capture-pinocchio-ai.spec.ts`.

| Fecha | Versión / tag | Harness | Cobertura | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-07 | `plugin/pinocchio@0.2.31` | n/a | n/a (e2e) | 2 / 8 | **Paridad con el catálogo de providers de AI del core.** El back publicaba su propia lista hardcodeada de tipos (`[…,'kwirth']`, sin `anthropic` ni `openai-compat`) → un provider `openai-compat` creado desde los menús *AI Providers* del core se veía **sin Type** dentro del canal, y no se podía crear uno desde el canal (sin opción `openai-compat` tampoco aparecía el campo **Base URL**). Ahora sale de `PROVIDERS_AVAILABLE` de `kwirth-common-ai` (fuente única). Además: `onLoadModels` cableado al core (botón **Load models**), `backChannels` en `IChannelRequirements` (el plugin no compilaba contra el common nuevo), deps al día (common 0.5.45 / common-ai 0.5.47 / common-front 0.5.52 / common-back 0.5.40) y borrados `PinocchioConfigLlm.tsx` + `PinocchioConfigProvider.tsx` (312 líneas muertas que además tiraban `type`/`endpoint`/costes). e2e **nuevo**: `pinocchio-ai-config` (5 casos, contrato del AI config compartido) y `pinocchio-ai-provider-roundtrip` (3 casos, alta/relectura/borrado de un provider `openai-compat` desde el canal, no destructivo). Guía y capturas de AI config regeneradas. Verificado que los datos guardados NO estaban corruptos: el fallo era de presentación y de alta. |
