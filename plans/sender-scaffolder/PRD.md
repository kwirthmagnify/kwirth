# Scaffolder de senders — PRD

> Estado: **VIVO** (2026-11-02), sin empezar. Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en streams va al [PLAN](./PLAN.md).
> Si algo de aquí contradice lo que ves en el producto, gana el producto.

## 1. Resumen

Hay un scaffolder por tipo de extensión en `tools/create-kwirth-*.mjs` —plugin, provider, dce, aitoolset,
login, theme, homepage— **salvo para los senders**, que son el tipo con más ejemplares del repo (doce en
`senders/`). Cada sender nuevo se ha hecho copiando otro, y la copia arrastra lo que tuviera el original,
incluidos sus defectos.

**Criterio de éxito**: `node tools/create-kwirth-sender.mjs --id x --publisher '@scope'` produce una carpeta
que **compila con typecheck, pasa sus tests y lleva un README publicable** sin tocar nada a mano; y el
primer sender real que nazca de él (`graylog`, de pago) no necesita copiar un solo fichero de otro sender.

## 2. El problema

Lo que hoy se copia a mano de un sender a otro, y lo que se ha perdido por el camino:

- **No todos tienen tests.** De los doce, solo `datadog`, `file` y `gitlab-issues` tienen `tests/` y
  `docs/qa/`. El resto nunca los tuvo, porque el sender del que se copiaron tampoco.
- **El build y el watch divergen.** El `build.mjs` de `datadog` escribe `extensionType: 'sender'` en el
  `dist/package.json`; su `watch.mjs` no. El paquete que se publica y el que se carga en dev no son el mismo.
- **El README es lo primero que se olvida**, y es obligatorio en todo publish a npm público.
- **Los patrones buenos no se heredan.** `datadog` resolvió bien el destino HTTP (timeout con
  `AbortController`, códigos traducidos a pistas, un doble local para probar sin cuenta) y el lote
  (`sendBatch` con troceo por límites antes de salir). Nada de eso está disponible para el siguiente
  sender salvo copiándolo.

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien escribe un sender de **notificación** (Teams, email…) | Un `send()` que compila y un test que pasa, para empezar por la lógica |
| CU2 | Quien escribe un sender de **log** (Datadog, Graylog, Elastic, Loki) | Además, `sendBatch` y un mapeo puro separado del transporte |
| CU3 | Quien escribe un sender contra una **API HTTP** | El transporte con timeout y errores legibles, y un doble local para no disparar envíos reales en los tests |
| CU4 | Quien escribe un **filtro** (regex, ratelimit) | `senderType = 'filter'` y `evalFilter` |
| CU5 | Un tercero, con su propio scope | Lo mismo, sin nada de Kwirth ni de IRIA cableado dentro |

## 4. Objetivos y no-objetivos

**Objetivos**

- Paridad con los otros scaffolders: modo interactivo, modo `--id` sin preguntas, `--publisher` obligatorio
  sin interactivo, `--into-existing`, nombre del paquete desde `tools/artifact-name.mjs`.
- Que lo generado sea **completo**: build, watch, tests, histórico de métricas, README, `.gitignore`.
- Que lo opcional se pida por flag, no se genere siempre: un sender de Teams no necesita `sendBatch`.

**No-objetivos**

- **No migra los senders existentes.** El scaffolder es para lo nuevo; los doce actuales siguen como están.
- **No toca nada fuera de la carpeta que crea.** Ni `.gitignore` raíz, ni `back/kwirth-dev.json`, ni el
  manifest.
- **No publica.** Termina con la carpeta lista para `npm install`.

## 5. Requisitos funcionales

| RF | qué |
|---|---|
| RF1 | Pregunta (o toma de flags) `id`, `name`, `publisher`, `description`, `website` |
| RF2 | `--kind output\|filter`. `output` genera `send`; `filter` genera `senderType = 'filter'` y `evalFilter(configName, message, forward)` |
| RF3 | `--batch` genera `sendBatch` y un `src/back/map.ts` **sin red** con el mapeo mensaje → evento y el troceo por límites (entradas y bytes), con sus constantes |
| RF4 | `--http` genera el campo `endpoint`, el `post()` con `fetch` + `AbortController` + timeout, la traducción de códigos HTTP a pista, y un **doble local** en `tools/<id>-double.mjs` con un test que lo usa |
| RF5 | `src/back/index.ts` declara `implements ISender`, con `getConfigSchema` (con un campo `password` de ejemplo), `getNodeMeta` y `setLogger` |
| RF6 | `build.mjs`: typecheck con `tsc --noEmit` antes del bundle, `dist/package.json` con `extensionType: 'sender'`, copia del README a `dist/` y aviso si falta |
| RF7 | `watch.mjs` escribe **exactamente el mismo** `dist/package.json` que el build: sale de una única función, no de dos literales |
| RF8 | `tests/run.mjs` (esbuild + `node --test`, con `COVERAGE=1`) y un `tests/<id>.test.ts` que **pasa** recién generado |
| RF9 | `docs/qa/test-metrics-history.md` con su cabecera y la tabla vacía, en el formato que lee `tools/gen-coverage-chart.mjs` |
| RF10 | `README.md` con qué es, tabla de configuración, cómo se instala en Kwirth y enlace a `https://kwirthmagnify.dev` y al repo |
| RF11 | `package.json` con `build`, `test`, `watch`, `requiresRestart: false`, `requiresExtension: []` y `kwirth-common-back` en la **última** versión publicada |
| RF12 | Con un `publisher` distinto de los públicos, **imprime** al final los pasos que el scaffolder no hace (anti-fuga, dev, registro privado) |

## 6. Decisiones cerradas

- **D1** — Lo opcional va por flag (`--batch`, `--http`, `--kind`). Generarlo todo siempre llenaría de
  código muerto a los senders de notificación, que son la mayoría.
- **D2** — El mapeo vive en `map.ts`, **sin red**. Es lo que hay que acertar en un sender de log, y separado
  se prueba sin dobles.
- **D3** — El doble HTTP es **parte de lo generado**, no un extra: ningún test puede disparar envíos reales
  al destino de nadie, y sin doble el test de transporte no existe.
- **D4** — El scaffolder **no escribe fuera de su carpeta**. Para un artefacto privado, escribir el
  `.gitignore` raíz desde un script del repo público sería otra vía para que la ruta acabe donde no debe;
  se imprime la lista y lo hace quien lo crea.
- **D5** — `build.mjs` y `watch.mjs` comparten la construcción del `dist/package.json` (RF7). La divergencia
  actual de `datadog` es exactamente lo que se quiere evitar.

## 7. Lo que hay que decir en voz alta

- **El test de ejemplo prueba poco.** Que pase recién generado garantiza que la tubería funciona, no que
  el sender esté probado. El histórico de métricas lo dejará ver en la primera fila.
- **Lo generado envejece.** Si `ISender` cambia, el scaffolder hay que tocarlo a la vez; el typecheck de lo
  generado (§8) es lo que lo destapa.

## 8. Criterios de aceptación

- Las combinaciones `output`, `filter`, `output --batch --http` y `--into-existing` generan carpetas que
  pasan `npm install`, `npm run build` (typecheck incluido) y `npm test` sin tocar nada.
- En todas, el `dist/package.json` del watch es idéntico al del build.
- `--into-existing` conserva los ficheros que ya había y lo dice uno por uno.
- El primer sender real, `graylog`, nace de aquí.

## 9. Abierto

- Si los senders existentes sin tests se migran algún día. Fuera de este PRD.
