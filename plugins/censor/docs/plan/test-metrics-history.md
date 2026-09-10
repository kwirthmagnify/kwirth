# Censor — histórico de métricas de test

> Registro **incremental** de la suite de tests, una fila por **CL9 / tag**. Se **añade** una fila arriba en
> cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`).
> - **Cobertura** = `COVERAGE=1 npm test` (Node `--experimental-test-coverage` con sourcemaps a `src/`). ⚠️ Es
>   sobre los módulos que el harness **carga** (back del canal + common), **no** el 100% del código: los
>   componentes React (`.tsx`) los cubre el e2e (no medido numéricamente).
> - **e2e** = nº de spec files (`e2e/tests/*.spec.ts`) y nº de casos `test()`. El spec `zz-capture` es
>   capture-only (skipped salvo `CENSOR_CAPTURE=1`) y no cuenta como caso de regresión.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-10 | `plugin/censor@0.2.48` | **24** | **58.31% / 68.28% / 69.18%** | 2 / 5 | **Primer CL9 de censor con harness y e2e propios.** Dos features: (1) **inventario de assets separado del stream de logs** — los streams se abren al analizar y se abortan al parar, un cierre prematuro reconecta con backoff en vez de borrar el objeto, `sinceSeconds` en lugar de `tailLines` (el tail metía una línea histórica de cada container en el primer lote del LLM), emisión agrupada del inventario y estado por asset (`idle`/`streaming`/`reconnecting`/`failed`) visible en Objects; (2) **autostart del análisis** — un único switch para todo el canal (`censor-autostart`) que arranca las configs ON al arrancar el channel. **e2e creado desde cero** (no existía): harness aislado con Playwright 1.61.1 (pinneado a la versión cuyo navegador ya está instalado), `.creds.json` gitignoreado, `data-testid` estables en el front (`censor-panel`, `censor-menu`, `censor-menu-config`, `censor-analyze-toggle`) y un `zz-capture` que refresca la captura del diálogo de config de la guía del core. El e2e del autostart comprueba el **contrato de UI** y cierra con Cancel: no persiste ni arranca análisis, para no gastar LLM real ni tocar la config del usuario; el comportamiento va cubierto por el harness. `COVERAGE=1` wired en el runner. |
