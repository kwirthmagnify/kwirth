# PLAN — Scaffolder de webhooks

> Cuelga de [PRD.md](PRD.md). **Estado: CERRADO** (2026-11-03). S1 entregado y validado por el usuario (QA
> manual del modo interactivo). Lo que queda abierto está en el backlog, fuera de este plan.
>
> Cada stream cierra su **CL9 completo**, con el punto 3 como gate.

| stream | qué | dónde | estado |
|---|---|---|---|
| **S1** | `tools/create-kwirth-webhook.mjs` + `tools/README.md` + sección *Writing your own* de la guía de webhooks | core (repo público) | ✅ **cerrado** 2026-11-03 |

El primer consumidor es el webhook `otrs`, de pago. Su plan, que vive en su repo privado, lo tenía como
prerrequisito (stream SW).

---

## Estado verificado del código (2026-11-02)

- Siete scaffolders en `tools/`. Comparten el arranque: `flag()`/`hasFlag()`, `--help`, `--into-existing`,
  `requirePublisher()` y `artifactName()` de `tools/artifact-name.mjs`, y un `write()` que conserva lo
  existente. El de senders ([sender-scaffolder](../sender-scaffolder/PLAN.md)) se cerró justo antes, y este
  copia su estructura.
- Contrato: `common-back/src/IWebhook.ts`. Obligatorios `id`, `verify`, `parse`, `addConfig`,
  `removeConfig`, `hasConfig` y `getConfigNames`. Opcionales `getConfigSchema`, `getNodeMeta`,
  `startWebhook` y `stopWebhook`. A diferencia de los senders, el core **no** le pasa logger a un webhook
  (`WebhookManager` no llama a `setLogger`), así que lo generado no lleva.
- El receptor del core (`back/src/tools/WebhookReceiver.ts`) responde 401 si `verify()` devuelve `false` o
  lanza, y 400 si `parse()` devuelve `null` o lanza.
- Referencias: `webhooks/gitlab-issues` (tests, métricas) y `webhooks/jira` (sin tests). Los dos son de pago.
- ⚠️ El `watch.mjs` de `gitlab-issues` no escribe `extensionType` ni `website` en el `dist/package.json`, y
  su `build.mjs` sí. Se anota; **no se corrige desde aquí** (otro repo, otro ciclo).

## S1 · `create-kwirth-webhook.mjs` — ✅ cerrado

**Entregado**:

- El script, con RF1–RF10 del PRD: gemelo del de senders en build, watch (`dist-meta.mjs` compartido),
  runner, histórico de métricas, README, `--private` e `--into-existing`.
- **Sin autenticación** (D1, decisión del usuario): `verify()` nace **cerrado** (D2) y un test fija ese
  estado; está hecho para romperse el día que se escriba la autenticación.
- `parse()` de ejemplo contra `tests/fixtures/sample.json`, leído como `Buffer` igual que lo entrega el core.
- Fila y párrafo en `tools/README.md`; sección *Writing your own* en
  `docs/0.6.31/guide/extensions/webhooks/`.
- Un cambio sobre el PRD: el icono de nodo es **`Link`**, porque `Webhook` no está en el conjunto curado de
  `kwirth-common-front` (`kwirthicons.ts`) y el front habría pintado el genérico sin avisar.

**Validación**: generado fuera del repo con `--id` (público) y con `--into-existing --private`, cada uno con
`npm install` + `npm run build` (typecheck) + `npm test` (5 tests) + `COVERAGE=1 npm test` + comparación del
`dist/package.json` de watch y build (idénticos). `--into-existing` conserva un README y un `docs/plan/`
escritos a mano; sin él se niega a pisar la carpeta; sin `--publisher` se niega a arrancar. El modo
interactivo no se pudo probar con la entrada por tubería (`readline/promises` pierde las líneas que llegan
antes de la pregunta; el código es el mismo que el del scaffolder de senders): lo cubrió el QA manual del
usuario, validado.

**Lo que destapó** (y se arregló antes del cierre):

- El mismo par de defectos del runner que el cierre de senders: el bundle de cobertura no entraba en el
  filtro (`node --test` sin ficheros, informe vacío al **100 %**), y sin `--enable-source-maps` el informe
  medía el bundle y no `src/`. El runner generado es ahora idéntico al del de senders. Con el informe
  mapeado, las líneas de comentario cuentan como no cubiertas, y el `index.ts` generado tiene muchas a
  propósito: el porcentaje de líneas sale bajo (≈56 %) aunque ramas y funciones sean altas.

**CL9**: el scaffolder no tiene harness ni e2e propios —su prueba es que lo que genera compila y pasa— y el
harness del core no cambia, así que no hay fila nueva en `docs/qa/test-metrics-history.md`. Sin tag (no es
una extensión). El tgz de la guía del core (`back/bundle/docs/kwirth.tgz`) está regenerado; el back de dev
la servirá tras reiniciarlo.

## Backlog del tema

- `jira` sin `tests/` ni `docs/qa/`. No se migra desde este plan.
- Corregir el `watch.mjs` de `gitlab-issues` en su próximo bump.
- Los runners de `webhooks/gitlab-issues` (y de `jira` si se le añaden tests) no pasan
  `--enable-source-maps`: es el mismo punto del backlog de [sender-scaffolder](../sender-scaffolder/PLAN.md).
- Probar el modo interactivo de los dos scaffolders desde un test: hoy solo se puede a mano.
- Si los scaffolders de sender y de webhook comparten código (PRD §9): son casi gemelos, y el defecto del
  runner hubo que arreglarlo dos veces.
