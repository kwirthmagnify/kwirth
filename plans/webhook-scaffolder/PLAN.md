# PLAN — Scaffolder de webhooks

> Cuelga de [PRD.md](PRD.md). **Estado: VIVO, S1 en curso** (2026-11-02). PRD (D1–D5) y streams validados
> con el usuario.
>
> Cada stream cierra su **CL9 completo**, con el punto 3 como gate.

| stream | qué | dónde | estado |
|---|---|---|---|
| **S1** | `tools/create-kwirth-webhook.mjs` + su fila en `tools/README.md` | core (repo público) | 🔨 en curso |

El primer consumidor es el webhook `otrs`, de pago. Su plan, que vive en su repo privado, lo tiene como
prerrequisito.

---

## Estado verificado del código (2026-11-02)

- Siete scaffolders en `tools/`. Comparten el arranque: `flag()`/`hasFlag()`, `--help`, `--into-existing`,
  `requirePublisher()` y `artifactName()` de `tools/artifact-name.mjs`, y un `write()` que conserva lo
  existente. El de provider es la referencia más cercana. El de senders se está escribiendo en paralelo
  ([sender-scaffolder](../sender-scaffolder/PLAN.md)); si acaba antes, este copia su estructura.
- Contrato: `common-back/src/IWebhook.ts`. Obligatorios `id`, `verify`, `parse`, `addConfig`,
  `removeConfig`, `hasConfig` y `getConfigNames`. Opcionales `getConfigSchema`, `getNodeMeta`,
  `startWebhook` y `stopWebhook`.
- Referencias: `webhooks/gitlab-issues` (tests, métricas) y `webhooks/jira`
  (`Authorization`, sin tests). Los dos son de pago.
- ⚠️ El `watch.mjs` de `gitlab-issues` no escribe `extensionType` ni `website` en el `dist/package.json`, y
  su `build.mjs` sí. Se anota; **no se corrige desde aquí** (otro repo, otro ciclo).

## S1 · `create-kwirth-webhook.mjs`

**Entra**: el script (RF1–RF10 del PRD) y la fila de la tabla de `tools/README.md`.

**Validación**:

- Generar en el scratchpad los tres modos del criterio de aceptación. En cada una, `npm install`,
  `npm run build` y `npm test`, y comparar el `dist/package.json` del watch con el del build.
- `--into-existing` sobre una carpeta con un README y un `docs/plan/` escritos a mano: los conserva.
- QA manual: el usuario lo lanza en modo interactivo.

**CL9**: el scaffolder no tiene interfaz ni harness propio. Su prueba es que lo que genera compila y pasa.

## Backlog del tema

- `jira` sin `tests/` ni `docs/qa/`. No se migra desde este plan.
- Corregir el `watch.mjs` de `gitlab-issues` en su próximo bump.
