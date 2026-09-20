# Trivy Provider — histórico de métricas de test

> Registro **incremental** de la suite de tests, una fila por **CL9 / tag**. Se **añade** una fila arriba en
> cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`).
> - **Cobertura** = `COVERAGE=1 npm test` (Node `--experimental-test-coverage` con sourcemaps a `src/`). ⚠️ Es
>   sobre los módulos que el harness **carga**. Los informers contra CRD reales no se ejercitan aquí: eso
>   necesita un cluster con Trivy Operator, y va en el QA manual.
> - **e2e** = este provider no tiene UI propia. Lo que se ve de él se depura desde el canal `provider-debug`,
>   que tiene su propia suite.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-09-20 | `provider/trivy@0.1.9` | **10** | **78.53% / 90.48% / 76.19%** | — | **Primer harness de este provider, y el fallo que lo motivó: tumbaba el core entero.** Un suscriptor que no pide tipos de reporte concretos manda un objeto **vacío** —`provider-debug` lo hace siempre, porque suscribirse sin payload es lo normal ahí— y el valor por defecto se elegía con `data ?? { reportTypes: ALL_PLURALS }`: `{}` **no es nullish**, así que el default no entraba y `reportTypes` se quedaba en `undefined`. Lo siguiente era un `for...of undefined` dentro de una promesa que nadie esperaba: **unhandled rejection**, y el core sale por su propio handler. En el log no se veía nada útil, solo `Reason: {}` (arreglado aparte en el core: un `Error` no tiene propiedades enumerables y `JSON.stringify` lo vacía). **Dos reglas quedan fijadas por los tests:** el default se decide **mirando `reportTypes`** (cubre `{}`, `undefined` y la lista vacía, que ahora significa *todos* y no *ninguno*), y **todo fire-and-forget lleva su `catch`** — ni el sync de estado inicial ni la entrega del meta pueden convertir un fallo suyo en la muerte del proceso. Verificado en rojo: con el código anterior caen **7 de 10** y salta el `TypeError: reportTypes is not iterable`. Los tests cubren además lo que ya funcionaba y no quería perderse: el estado inicial va **solo** al suscriptor que llega, un LIST que falla no se lleva por delante a los demás tipos, y si Trivy Operator no está instalado el alta sigue adelante con un meta vacío. |
