# e2e del core

Suite Playwright del core de Kwirth. Conduce por HTTP un Kwirth que ya está levantado: no arranca nada,
no compila nada y no forma parte del build del front.

## Cómo se corre

```sh
npm install                              # la primera vez
npx playwright test --reporter=list > run.log 2>&1
```

La salida va **a fichero y sin filtros**, y el reporter escribe **por test**: así cualquiera puede mirar
`run.log` mientras corre y saber por dónde va. Nada de `| Select-Object -Last N` ni `| tail`, que retienen
la salida hasta el final y dejan la corrida a ciegas durante media hora.

Un fichero suelto:

```sh
npx playwright test nettools-channel --reporter=list
```

### Lo que no entra en la corrida por defecto

Dos familias están excluidas por `testIgnore`, y la exclusión se salta **con una variable**, no nombrando
el fichero: `testIgnore` se aplica igual aunque se pase la ruta en la línea de comandos.

| | qué son | cómo se lanzan |
|---|---|---|
| `tests/private/**` | e2e de artefactos **de pago**, que tienen su propio ciclo y su propia checklist de cierre, y algunos escriben datos o regeneran capturas de SU repo | `PRIVATE=1 npx playwright test tests/private/<fichero>` |
| `tests/capture-*.spec.ts` | no verifican nada: **sobrescriben** las imágenes de la guía en `docs/_media` | `CAPTURES=1 npx playwright test tests/capture-managers.spec.ts` |

## Qué hace falta

- El dev levantado: front en `:3000`, back en `:3883`.
- `.creds.json` en esta carpeta (gitignored), o las variables `KWIRTH_E2E_URL`, `KWIRTH_E2E_USER` y
  `KWIRTH_E2E_PASS`.
- 🔴 **`back/kwirth-dev.json` con las extensiones que la suite necesita.** No es un detalle de
  configuración: seis ficheros enteros —42 casos— no se ejecutaron durante meses porque faltaban diez
  extensiones, y la corrida **salía con exit 0**. Un `describe.serial` cuyo primer test falla por una
  precondición del entorno deja los demás en `did not run`, y eso no cuenta como fallo. Si se añade un
  spec que necesita una extensión, va también al `kwirth-dev.json`.

## La sesión es de la CORRIDA, no de cada fichero

Arrancar Kwirth —cargar el bundle de CRA, el login, esperar a que la barra superior pinte y a
`networkidle`— cuesta entre 45 y 60 segundos, y **crece con cada extensión instalada**. Pagarlo una vez
por fichero son unos cincuenta minutos de una corrida de cien.

`tests/fixtures.ts` exporta un `test` cuyo fixture `kwirth` es de ámbito **worker**: con `workers: 1` la
página se abre **una vez** y la heredan todos los ficheros que la piden. Un spec nuevo la usa así:

```ts
import { test, expect } from './fixtures'

test.beforeAll(async ({ kwirth }) => {
    page = kwirth
    await dismissOpenDialogs(page)
})

// La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
test.afterAll(async () => { await dismissOpenDialogs(page).catch(() => {}) })
```

Dos reglas que van con ello, y el fixture las explica con el motivo de cada una:

- **No todos pueden heredarla.** Los que prueban el propio arranque, los que entran por una URL que no es
  la raíz y los que **espían las peticiones iniciales** abren la suya con `browser.newPage()`. La lista
  está en el comentario de `fixtures.ts`.
- **Lo que un fichero deja abierto rompe al siguiente**, así que cada uno limpia en su `afterAll` y
  deshace el estado que haya escrito. No hay barrido automático: media docena de gestores abren su
  diálogo en el `beforeAll` y lo recorren a lo largo de varios tests, de modo que un barrido por test les
  cerraría en la cara lo que están mirando.

Y nunca `goto('about:blank')` en un `afterAll`: eso mata la sesión de todos los ficheros que vengan
detrás.

## Esperas

`CARGA` (60 s, en `helpers.ts`) es **lo que se espera a que algo cargue**, no el plazo de la
comprobación: un diálogo de ajustes trae sus datos antes de habilitar los campos, y uno de catálogo
resuelve los manifests remotos antes de tener tarjetas. Estaba copiado por media suite con tres valores
distintos; vive en un sitio para que la próxima vez que el dev se vuelva más lento se toque una línea.

⚠️ `waitForTimeout` fijo es la causa clásica de los rojos intermitentes, y el error sale mucho más tarde
y en otro sitio: un `waitForTimeout(1500)` en `login()` se leyó durante semanas como «el menú no
responde». Se espera **a que la cosa esté**, no un rato.

⚠️ `isVisible()` **no espera**, por grande que sea el timeout que se le pase: devuelve el estado de ese
instante. Para esperar, `waitFor`.

## Las métricas

El histórico vive en [`docs/qa/test-metrics-history.md`](../../docs/qa/test-metrics-history.md), con una
fila por cierre y los dos PNG que se regeneran de él. La sección *Pendiente sobre la propia suite* es
donde van los flaky y lo que no se ha explicado todavía: un flaky anotado es deuda, uno callado es una
trampa para el siguiente.
