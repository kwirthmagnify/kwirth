# DCE xyflow — histórico de métricas de test

> Registro **incremental** de la suite de este DCE, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`).
> - **Cobertura** = `COVERAGE=1 npm test`. ⚠️ Mide el código del DCE (`src/`), no el de React Flow ni el
>   de elk, que se cargan de `node_modules` sin bundlear. La inyección del CSS (`src/front/index.ts`) corre
>   en un navegador y no entra: la cubre el e2e.
> - **e2e** = specs del core que prueban este DCE (`front/e2e/tests/dce-xyflow.spec.ts`) y nº de casos.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-10-05 | `dce/xyflow@0.1.0` | **5** ✅ | **100.00 % / 100.00 % / 100.00 %** | 1 spec · 3 casos ✅ | **Nace el DCE.** React Flow (`@xyflow/react`) y elk (`elkjs`) salen del core a un DCE de solo front: `IXyflow { id, reactFlow, loadElk() }`. React y ReactDOM **no** van dentro: se resuelven contra los del core (`window.__kwirth__.React` / `.ReactDOM`), porque los hooks de React Flow solo funcionan con el React que los pinta; `react/jsx-runtime` sí se bundlea, y su `require('react')` cae en el mismo global. El CSS de React Flow viaja como texto y la fábrica lo inyecta una vez (`<style id="kwirth-dce-xyflow-css">`). `loadElk()` sigue siendo async para que elk pueda volver a ser diferido sin que los consumidores cambien. 🔴 **El contrato se publica con el paquete** (`index.d.ts` + `types`): los consumidores lo tipan con la versión de npm, nunca con un `file:`. **5 harness** con valores (id, exports de React Flow y sus enums, un solo namespace, elk REAL que coloca un grafo de arriba abajo, el CSS es el de React Flow) y **3 e2e** (instalado y solo front; el `front.js` registra fábrica y no lleva React propio; en el navegador la fábrica corre, React Flow y elk funcionan, el CSS está en la página y el core ya no publica `reactFlow` ni `loadElk`). front.js: 1,68 MB (511 KB gzip), casi todo elk. |
