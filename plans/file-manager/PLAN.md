# file-manager — DCE del gestor de ficheros — PLAN

> Estado: **CERRADO** (2026-10-13). S1 y S2 entregados, QA validado y ambos publicados: DCE
> `file-manager@0.1.0` y `fileman@0.2.26`. Sacar la librería del core sigue en el backlog, y ahora se
> sabe que depende de migrar **magnify, que es código del core** (F8). El [PRD](./PRD.md) dice qué y por qué; esto dice en qué
> orden y con qué se da por hecho. Append-only.

Dos streams, validados con el usuario antes de empezar. Sacar la librería del core **no** entra: va al
backlog hasta que `magnify` esté migrado.

## S1 — la DCE `file-manager`

**Alcance**: la DCE solo-front, publicada, con sus tests y su `docs/qa`.

| # | tarea | estado |
|---|---|---|
| S1.1 | Scaffold con `node tools/create-kwirth-dce.mjs --id file-manager --sides front` | ✅ |
| S1.2 | El contrato en `src/common/index.ts`: `typeof import(...)`, tipos y nada de runtime | ✅ |
| S1.3 | La instancia en `src/front/FileManagerDceImpl.ts` | ✅ |
| S1.4 | El registro en `src/front/index.ts` y la inyección en `src/front/css.ts` (separada, ver F2), más `stylesheets.d.ts` | ✅ |
| S1.5 | `build.mjs` / `watch.mjs`: globals de react y react-dom, loader `.css` como texto, `index.d.ts` y `types` en el dist | ✅ |
| S1.6 | Harness: **3 ✅ / 0 ❌**, y `COVERAGE=1` añadido al runner | ✅ |
| S1.7 | Cableado de desarrollo en `back/kwirth-dev.json` | ✅ |
| S1.8 | E2E `front/e2e/tests/dce-file-manager.spec.ts`: **4 ✅** | ✅ |
| S1.9 | `docs/qa/` propio: histórico + los dos PNG | ✅ |
| S1.10 | QA manual | ✅ validado por el usuario |
| S1.11 | Guía (página propia, fila en la tabla y sidebar), publish `0.1.0`, manifest, commit, tag, push | ✅ |

### Hallazgos de S1

| # | hallazgo |
|---|---|
| F1 | 🔴 **La librería no publica tipos.** Ni `types` ni un `.d.ts`. `plugins/fileman` compila porque tiene `strict: false`, así que lleva tiempo importando `IFileObject` y compañía como `any` sin que nadie lo notara. El DCE **no** apaga su strict: declara el módulo en `src/common/rfm.d.ts`, donde está escrito el porqué. Acota lo que vale el `index.d.ts` publicado, y arreglarlo de verdad es cosa de la librería |
| F2 | 🔴 **La librería toca `document` AL IMPORTARSE**, así que nada que la arrastre se puede cargar en node: el harness no puede construir la instancia. La inyección del CSS se extrajo a `src/front/css.ts` para que al menos la única lógica propia del DCE —hacerlo una sola vez— tenga test. Lo demás lo cubre el e2e, en un Chromium de verdad. Fabricar un `document` falso habría sido probar un navegador que no existe |
| F3 | 🔴 **Su `main` está ROTO en el tarball**: apunta a `src/index.js`, que importa `./FileManager/FileManager`, y el publish solo incluye `dist/`. Los navegadores no lo pisan porque los bundlers prefieren `module`; desde node hay que forzar `mainFields: ['module','main']` en el runner de tests |
| F4 | ⚠️ **`css.d.ts` tuvo que renombrarse a `stylesheets.d.ts`.** Al crear `css.ts` al lado, TypeScript tomó el `.d.ts` por la declaración generada de ese `.ts` y lo ignoró en silencio: el import del CSS dejó de resolver. Los otros DCE lo llaman `css.d.ts` porque no tienen un `css.ts` |
| F5 | ⚠️ **`FileManager` es un OBJETO, no una función**: la librería lo envuelve (`forwardRef`). El e2e asierta su `$$typeof` de React en vez de `typeof === 'function'`, que sería asertar cómo está envuelto — cosa de la librería, no del contrato |
| F6 | ⚠️ El bundle no lleva React, pero sí el **jsx-runtime de desarrollo**, embebido en el ESM de la librería. No es nuestro y no se puede quitar desde aquí |
| F7 | ⚠️ **No es de este plan**: tres specs del repo (`dce-api`, `dce-xyflow`, `dce-nettools`) apuntan a `/core/dce` y la ruta es ahora `/core/dces`. Reportado al usuario |
| F8 | 🔴 **`magnify` NO es un plugin instalable: es código del CORE**, en `front/src/channels/magnify/`, y su `MagnifyTabContent.tsx:23` hace `import '@jfvilas/react-file-manager/dist/style.css'`. Lo destapó el QA: la página tiene **tres** hojas con los selectores de la librería —dos sin id, de 66 KB y 7 KB, que pone webpack por magnify, y la de la DCE— y las dos primeras están ahí **aunque no se abra `fileman`**. Cambia el backlog entero: sacar la librería del core no es quitar un global, es **migrar un canal del core a consumir la DCE** |
| F9 | ⚠️ **El check de QA que escribí para esto estaba mal planteado**: contar `<style>` con `.file-explorer` no dice quién los inyecta, y con magnify dentro del core salían 3 antes y después del cambio. El check correcto mira el **id**: la de la DCE es la única que lo lleva |

## S2 — `fileman` lo consume

**Alcance**: que el plugin deje de leer el global del core y lea la DCE, sin tocar su `src`.

| # | tarea | estado |
|---|---|---|
| S2.1 | `build.mjs` y `watch.mjs`: el paquete se mapea a la instancia de la DCE (cuatro sitios: el mapa está duplicado en ambos ficheros) | ✅ |
| S2.2 | `package.json`: `requiresExtension`, la librería pasa a devDependency (solo tipos) y `common-back` a la última (0.6.1, con `implements IChannel` comprobado) | ✅ |
| S2.3 | Entrada de manifest con `requires` (punto 8 de la CL9) | ✅ |
| S2.4 | Verificado: su `front.js` pasa de llevar librería + 100 KB de CSS a **42 KB** sin nada de eso | ✅ |
| S2.5 | E2E: 2 casos más en `dce-file-manager.spec.ts` (resuelve del registro y ya no lleva la librería; declara la dependencia). **6 ✅** en total | ✅ |
| S2.6 | QA manual, los cinco pasos | ✅ validado por el usuario |
| S2.7 | Cierre: bump `0.2.26`, publish, manifest con `requires`, commit, tag, push | ✅ |

## Lo que se sabe antes de empezar

| # | dato |
|---|---|
| K1 | La librería es `@jfvilas/react-file-manager@^1.5.6`, ESM. `fileman` usa `FileManager`, `IFileObject`, `IError`, `IFileManagerHandle` y `dist/style.css` |
| K2 | El core la importa en `front/src/index.tsx:15` y la publica como `jfvilasReactFileManager`. **Ahí se queda** en esta entrega |
| K3 | `fileman` ya mapea el paquete en su `build.mjs` (líneas 25 y 38, build y watch). Solo cambia el destino del mapeo |
| K4 | `magnify` no está en el repo público: no se toca |
| K5 | `dces/xyflow` es el patrón exacto: mismo problema, misma forma. Se copia, no se inventa |

## Backlog

Append-only. Nada de esto está empezado.

| # | qué | por qué no ahora |
|---|---|---|
| B1 | **Sacar la librería del core**: el import, el global, el `import` del CSS en `MagnifyTabContent.tsx` y `front/package.json` | Depende por completo de B2. Es el stream que de verdad adelgaza el core |
| B2 | 🔴 Migrar **`magnify`**, que es **código del core** (`front/src/channels/magnify/`), a consumir la DCE | Reescrito tras F8: no es un plugin externo como se creía al planificar. Un canal del core consumiendo una DCE es un caso que **no existe todavía** en Kwirth — los consumidores de DCE son extensiones, y su build mapea el paquete; el front del core lo construye CRA, que no tiene ese mapeo. Hay que decidir cómo antes de tocarlo |
| B2b | Mientras B2 no se haga, **la hoja de estilos de la librería está DOS veces en la página**: la del core (por magnify) y la de la DCE | Es el coste de la transición, y desaparece con B2. No afecta a cómo se ve nada: son la misma hoja |
| B3b | ⚠️ **React avisa de `unique "key" prop` al pintar la lista de ficheros.** Sale del RFM, no de Kwirth: los frames del stack (`F3`, `S3`) son componentes de la librería, y ni los props que le pasa `fileman` ni el React que la renderiza cambian con este plan. Valorado con el usuario el 2026-10-13 y atribuido a la librería | Se arregla **aguas arriba**, en `@jfvilas/react-file-manager`. Desde aquí solo se podría silenciar, que es peor |
| B3 | Entregar la librería **bajo demanda**, como `xyflow` hace con elk | Primero hay que ver si pesa lo bastante para que compense |
