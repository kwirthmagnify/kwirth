# Scaffolder de webhooks — PRD

> Estado: **VIVO** (2026-11-02), validado (D1–D5). Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en streams va al [PLAN](./PLAN.md). Hermano de [sender-scaffolder](../sender-scaffolder/PRD.md):
> mismas reglas, y donde no se diga otra cosa, mismas decisiones.
> Si algo de aquí contradice lo que ves en el producto, gana el producto.

## 1. Resumen

`tools/create-kwirth-*.mjs` no cubre los **webhooks**. Los dos que hay (`jira`, `gitlab-issues`) se hicieron
copiando, y el tercero (`otrs`) está a punto de nacer igual.

**Criterio de éxito**: `node tools/create-kwirth-webhook.mjs --id x --publisher '@scope'`
produce una carpeta que **compila con typecheck, pasa sus tests y lleva un README publicable** sin tocar
nada a mano; y el webhook `otrs` nace de él sin copiar un solo fichero de otro webhook.

## 2. El problema

- **El watch y el build no publican el mismo paquete.** En `webhooks/gitlab-issues`, el `build.mjs` escribe
  `extensionType: 'webhook'` y `website` en el `dist/package.json`, y el `watch.mjs` no. El paquete que se
  carga en dev no es el que se publica.
- **No todos tienen tests.** `jira` no tiene `tests/` ni `docs/qa/`; `gitlab-issues` sí.
- **El README se olvida**, y es obligatorio en todo publish a npm público.

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien integra un sistema externo que llama a Kwirth (GitLab, Jira, OTRS…) | Un webhook que compila, con tests y métricas, para empezar directamente por `verify()` y `parse()` |
| CU2 | Un tercero, con su propio scope | Lo mismo, sin nada de Kwirth ni de IRIA cableado dentro |

## 4. Objetivos y no-objetivos

**Objetivos**

- Paridad con los otros scaffolders: modo interactivo, modo `--id` sin preguntas, `--publisher` obligatorio
  sin interactivo, `--into-existing`, nombre del paquete desde `tools/artifact-name.mjs`.
- Lo generado es **completo**: build, watch, tests, histórico de métricas, README y `.gitignore`.
- Lo generado es **seguro por defecto**: recién creado no acepta ninguna llamada.

**No-objetivos**

- **No migra los webhooks existentes.**
- **No toca nada fuera de la carpeta que crea**: ni `.gitignore` raíz, ni `back/kwirth-dev.json`, ni el
  manifest.
- **No publica.**
- **No genera autenticación.** Cómo se verifica una llamada es de cada sistema origen (secreto en cabecera,
  HMAC, Basic auth…) y lo escribe quien integra.
- **No genera e2e de Playwright.** El de `jira` prueba la URL del webhook y el chip del gestor, que son del
  core y no del artefacto.

## 5. Requisitos funcionales

| RF | qué |
|---|---|
| RF1 | Pregunta (o toma de flags) `id`, `name`, `publisher`, `description`, `website` |
| RF2 | `src/back/index.ts` declara `implements IWebhook`, con `getConfigSchema` (solo `name`), `getNodeMeta`, y un `parse()` de ejemplo que entiende `tests/fixtures/sample.json` |
| RF3 | `verify()` generado **cerrado**: devuelve `false`, con un comentario que explica que hay que implementarlo y por qué arranca cerrado |
| RF4 | `build.mjs`: typecheck con `tsc --noEmit` antes del bundle, `dist/package.json` con `extensionType: 'webhook'`, copia del README a `dist/` y aviso si falta |
| RF5 | `watch.mjs` escribe **exactamente el mismo** `dist/package.json` que el build: los dos importan la misma función de `dist-meta.mjs` |
| RF6 | `tests/run.mjs` (esbuild + `node --test`, con `COVERAGE=1`) y `tests/<id>.test.ts` que **pasa** recién generado: `verify` rechaza (fija el arranque cerrado, y es el test que falla cuando se implementa, a propósito); `parse` con el ejemplo y con un cuerpo que no es JSON |
| RF7 | `docs/qa/test-metrics-history.md` con cabecera y tabla vacía, en el formato de `tools/gen-coverage-chart.mjs` |
| RF8 | `README.md` con qué es, tabla de configuración, cómo se instala en Kwirth, cómo se da de alta en el sistema origen, y enlace a `https://kwirthmagnify.dev` y al repo |
| RF9 | `package.json` con `build`, `test`, `watch`, `requiresRestart: false`, `requiresExtension: []` y `kwirth-common-back` en la **última** versión publicada |
| RF10 | Con un `publisher` distinto de los públicos, **imprime** al final los pasos que no hace (anti-fuga, dev, registro privado) |

## 6. Decisiones cerradas

- **D1** — **La autenticación no es del scaffolder** *(usuario, 2026-11-02)*: es específica de cada webhook.
  Se descartó generarla por flag (`--auth token|hmac|basic`).
- **D2** — `verify()` nace **cerrado** (`return false`). Un esqueleto que devolviera `true` aceptaría
  llamadas de cualquiera nada más instalarse, y eso no se ve fallar; uno cerrado responde 401 a todo, que
  se ve a la primera prueba.
- **D3** — `build.mjs` y `watch.mjs` comparten la construcción del `dist/package.json` desde un fichero
  propio (`dist-meta.mjs`), igual que el D5 del scaffolder de senders.
- **D4** — El scaffolder **no escribe fuera de su carpeta** (D4 del de senders).
- **D5** — El `parse()` generado es un **ejemplo** contra un fixture, no un contrato: lo reescribe siempre
  quien integra. El fixture existe para que el test de `parse` esté desde el primer minuto.

## 7. Lo que hay que decir en voz alta

- **El test de `verify` está hecho para romperse.** Cuando quien integra implementa la autenticación, ese
  test falla y hay que sustituirlo por los suyos (credencial buena, mala, ausente). Es deliberado: obliga a
  escribirlos.
- **El test de ejemplo prueba poco** del `parse()`. Garantiza la tubería, no la integración.
- **Si `IWebhook` cambia, el scaffolder hay que tocarlo a la vez.** El typecheck de lo generado es lo que
  lo destapa.

## 8. Criterios de aceptación

- El modo `--id`, el interactivo y `--into-existing` generan carpetas que pasan `npm install`, `npm run build` (typecheck incluido) y `npm test` sin tocar nada.
- En todas, el `dist/package.json` del watch es idéntico al del build.
- `--into-existing` conserva los ficheros que ya había y lo dice uno por uno.
- Recién generado e instalado, el webhook responde 401 a cualquier llamada.
- El webhook `otrs` nace de aquí.

## 9. Abierto

- Si los scaffolders de sender y de webhook deberían compartir código (son casi gemelos). Se decide al
  cerrar los dos, no antes.
