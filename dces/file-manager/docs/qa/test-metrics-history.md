# DCE file-manager — histórico de métricas de test

> Registro **incremental** de la suite de este DCE, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`).
> - **Cobertura** = `COVERAGE=1 npm test`. 🔴 **Mide MUY poco, y hay que leerlo sabiéndolo**:
>   `@jfvilas/react-file-manager` toca `document` **al importarse**, así que ni `index.ts` ni
>   `FileManagerDceImpl.ts` se pueden cargar en node. Lo único que el harness carga es `css.ts`. Un
>   100 % aquí significa «el único fichero que se puede medir está cubierto», no «el DCE está cubierto».
>   Lo que de verdad lo cubre es el **e2e**, que corre en un Chromium.
> - **e2e** = specs del core que prueban este DCE (`front/e2e/tests/dce-file-manager.spec.ts`) y nº de casos.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-10-12 | `dce/file-manager@0.1.0` | **3** ✅ | **100.00 % / 100.00 % / 100.00 %** ⚠️ solo `css.ts` | 1 spec · 4 casos ✅ | **Nace el DCE.** `@jfvilas/react-file-manager` sale del core a un DCE de **solo front**, para que lo instale quien lo use en vez de viajar en todas las instalaciones: `IFileManagerDce { id, fileManager }`. Lo que se comparte es el **namespace del módulo** y no un objeto propio, para que el consumidor siga escribiendo `import { FileManager } from '@jfvilas/react-file-manager'` y solo cambie a dónde lo resuelve su build — un wrapper sería una segunda API que mantener. React y ReactDOM **no** van dentro (`window.__kwirth__.React` / `.ReactDOM`): la librería es un componente React y sus hooks solo funcionan con el React que los pinta. El CSS viaja como texto y la fábrica lo inyecta una vez (`<style id="kwirth-dce-file-manager-css">`), con la inyección extraída a `css.ts` para que sea lo único testeable sin navegador. 🔴 **El contrato se publica con el paquete** (`index.d.ts` + `types`), nunca un `file:`. **Tres hallazgos de la librería, documentados en el código**: (1) **no publica tipos** —ni `types` ni un solo `.d.ts`—, y `plugins/fileman` compila solo porque tiene `strict: false`, así que lleva tiempo trabajando con `any` sin que nadie lo notara; aquí se declara el módulo explícitamente en vez de apagar el strict; (2) 🔴 **su `main` está ROTO en el tarball**: apunta a `src/index.js`, que importa `./FileManager/FileManager`, y el publish solo incluye `dist/` — los navegadores nunca lo pisan porque los bundlers prefieren `module`, pero desde node hay que forzar `mainFields: ['module','main']`; (3) su ESM trae embebido el **jsx-runtime de desarrollo**. ⚠️ **Y el `css.d.ts` tuvo que renombrarse a `stylesheets.d.ts`**: al crear `css.ts` al lado, TypeScript tomó el `.d.ts` por su declaración generada y lo ignoró, y el import del CSS dejó de resolver. front.js: 400 KB. **Los 4 e2e son los que valen** (instalado y solo front; el `front.js` servido sin React propio; en el navegador la fábrica corrió y el namespace lleva el componente —que es un **objeto**, no una función: la librería lo envuelve, y lo que se asierta es su `$$typeof` de React—; y el `<style>` está en la página una sola vez). El core **sigue publicando la librería**: sacarla de ahí es otro stream, y espera a que `magnify` esté migrado. |
