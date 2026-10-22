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
| 2026-10-22 | 🔴 `plugin/pinocchio@0.3.0` — **la puerta del canal** (A12 de [auth-hardening](../../../../plans/auth-hardening/PLAN.md)) | n/a | n/a (e2e) | 2 / 8 (sin cambios) | Pinocchio lee los **eventos del cluster** y se los da a un LLM: lo que entra en el prompt son nombres de workloads, mensajes de error y estado real de la instalación. Lo entregaba el core a cualquiera que estuviese logado, porque es `cluster: true` y esa rama de arranque **no mira la clave**. Ahora el canal exige `cluster` con su propia escalera. 🔴 **La autorización es del CANAL, no del core**: capa de negocio, no técnica (decisión de Julio, 2026-10-22). 🔴 **Y hubo que tocar el front**: su `case SIGNAL` solo entendía `START`+`RESPONSE` y **cualquier otra señal se perdía en silencio**, así que la denegación no se habría visto — la pestaña se quedaría sin decir nada. Ahora un error se escribe en la conversación, que es donde mira el usuario. Mismo patrón que apareció en `status` el mismo día: un canal que rechaza sin explicarse es peor que uno abierto. ⚠️ Sin harness propio: validado con QA manual (usuario sin scopes y usuario con `cluster`) |
| 2026-09-07 | `plugin/pinocchio@0.2.31` | n/a | n/a (e2e) | 2 / 8 | **Paridad con el catálogo de providers de AI del core.** El back publicaba su propia lista hardcodeada de tipos (`[…,'kwirth']`, sin `anthropic` ni `openai-compat`) → un provider `openai-compat` creado desde los menús *AI Providers* del core se veía **sin Type** dentro del canal, y no se podía crear uno desde el canal (sin opción `openai-compat` tampoco aparecía el campo **Base URL**). Ahora sale de `PROVIDERS_AVAILABLE` de `kwirth-common-ai` (fuente única). Además: `onLoadModels` cableado al core (botón **Load models**), `backChannels` en `IChannelRequirements` (el plugin no compilaba contra el common nuevo), deps al día (common 0.5.45 / common-ai 0.5.47 / common-front 0.5.52 / common-back 0.5.40) y borrados `PinocchioConfigLlm.tsx` + `PinocchioConfigProvider.tsx` (312 líneas muertas que además tiraban `type`/`endpoint`/costes). e2e **nuevo**: `pinocchio-ai-config` (5 casos, contrato del AI config compartido) y `pinocchio-ai-provider-roundtrip` (3 casos, alta/relectura/borrado de un provider `openai-compat` desde el canal, no destructivo). Guía y capturas de AI config regeneradas. Verificado que los datos guardados NO estaban corruptos: el fallo era de presentación y de alta. |
