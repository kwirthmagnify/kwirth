# Magnify (plugin) — histórico de métricas de test

> Registro **incremental** de la suite de tests del plugin `magnify`, una fila por **CL9 / cierre de
> stream**. Se **añade** una fila arriba en cada cierre; **no se sobrescribe**. Junto a él, los dos PNG que
> se regeneran de él con `node tools/gen-coverage-chart.mjs` (evolución de la cobertura y tamaño de la suite).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests de `npm test` (`node --test` sobre `tests/**/*.test.ts`, empaquetados con esbuild).
> - **Cobertura** = `COVERAGE=1 npm test`, mapeada a `src/` con sourcemaps. ⚠️ Solo cubre el **back**: el front
>   (React) lo cubre el e2e, no medido numéricamente.
> - **e2e** = nº de spec files de `e2e/tests` y nº de casos `test()`, contra el dev en marcha.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-10-13 | G2 de [`magnify-plugin`](../../../../plans/magnify-plugin/PLAN.md) — Magnify sale del core a un plugin (`plugin/magnify@0.1.0`) | **6** ✅ (mudados del core: `USAGE` con los dos providers y el feed de eventos por `getData`) | **24.68 % / 81.75 % / 27.69 %** | 1 spec · 5 casos ✅ (el primer e2e propio de Magnify: servido como plugin, overview con eventos y sin avisos, estilos, dibujo de sección, explorador) | **Primera versión como plugin.** Lo que cambia respecto al core: el back usa las operaciones de cluster de `kwirth-common-back` 0.6.4 y un `ClusterInfo` estructural, y escribe por el logger de canales del core; el front toma de `kwirth-common-front` los iconos y `ChannelTools`, de `window.__kwirth__` React, codemirror y recharts, y del DCE `file-manager` el explorador; empaqueta las librerías pequeñas que solo usaba Magnify (cron-parser, js-yaml, lodash —solo `get`/`set`—, react-draggable, react-resizable, `useAsync` de react-use). Los 7 PNG de fondo de las secciones pasan a **SVG** (~250 KB menos, y toman el color del tema). Front **minificado**: 524 KB (133 KB gzip); sin minificar y con los PNG era 1,6 MB. ⚠️ **Cobertura baja**: los tests son los que el core tenía de Magnify; el resto del back (comandos de lista, apply, delete, operaciones de nodo…) no tiene harness — backlog |
