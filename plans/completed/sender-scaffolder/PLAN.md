# PLAN — Scaffolder de senders

> Cuelga de [PRD.md](PRD.md). **Estado: CERRADO** (2026-11-03). S1 entregado y validado por el usuario (QA
> manual completo, nueve pasos). Lo que queda abierto está en el backlog, fuera de este plan.
>
> Cada stream cierra su **CL9 completo**, con el punto 3 como gate.

| stream | qué | dónde | estado |
|---|---|---|---|
| **S1** | `tools/create-kwirth-sender.mjs` + `tools/README.md` + sección *Writing your own* de la guía de senders | core (repo público) | ✅ **cerrado** 2026-11-03 |

El primer consumidor es el sender `graylog`, de pago, que tiene su propio plan en el repo privado.

---

## Estado verificado del código (2026-11-02)

- Siete scaffolders en `tools/` (`plugin`, `provider`, `dce`, `aitoolset`, `login`, `theme`, `homepage`).
  Comparten el arranque —`flag()`/`hasFlag()`, `--help`, `--into-existing`, `requirePublisher()` y
  `artifactName()` de `tools/artifact-name.mjs`, `write()` que conserva lo existente— y el de provider es la
  referencia más cercana (back-only, con modo de configuración por esquema).
- Contrato: `common-back/src/ISender.ts`. Obligatorios `id`, `addConfig`, `removeConfig`, `hasConfig`,
  `getConfigNames`, `send`, `startSender`, `stopSender`. Opcionales `senderType`, `getConfigSchema`,
  `getNodeMeta`, `setLogger`, `sendBatch`, `fetchStatus`, `evalFilter`.
- Referencias de lo que se generará: `senders/datadog` (lote + HTTP + doble, de pago) y `senders/file`
  (tests y métricas, público). `senders/regex` para el filtro.
- ⚠️ El `watch.mjs` de `datadog` no escribe `extensionType` en el `dist/package.json` y su `build.mjs` sí.
  Se anota; **no se corrige desde aquí** (otro repo, otro ciclo).

## S1 · `create-kwirth-sender.mjs` — ✅ cerrado

**Entregado**:

- El script, con RF1–RF12 del PRD. Un único cambio sobre lo acordado: el artefacto privado se marca con
  **`--private`** explícito en vez de deducirlo del `publisher` (RF12 actualizado en el PRD).
- `build.mjs` y `watch.mjs` importan **un mismo** `dist-meta.mjs` (D5): la divergencia de `datadog` no se
  puede reproducir en lo generado.
- El doble HTTP vive **una sola vez**, en TypeScript (`tests/<id>-double.ts`); `npm run double` lo bundlea y
  lo sirve. `datadog` lo tiene duplicado (un `.ts` para los tests y un `.mjs` para la demo).
- Fila y párrafo en `tools/README.md`; sección *Writing your own* en `docs/0.6.31/guide/extensions/senders/`.

**Validación**: cinco variantes generadas fuera del repo (`output`, `filter`, `--batch`, `--http`,
`--batch --http --private`), cada una con `npm install` + `npm run build` (typecheck) + `npm test` +
`COVERAGE=1 npm test` + comparación del `dist/package.json` de watch y build: todo en verde (6, 7, 10, 9 y
13 tests). `--into-existing` conserva un README y un `docs/plan/` escritos a mano; sin él se niega a pisar
la carpeta; `--kind filter --http` se rechaza. El doble por CLI responde 202 / 401 / `force-503`. QA manual
del usuario, nueve pasos, validado.

**Lo que destapó** (y se arregló antes del QA):

- **La cobertura daba 100 % midiendo nada.** Con `COVERAGE=1` el bundle único se llama
  `.coverage-all.generated.mjs`, el filtro solo recogía `*.test.mjs`, y `node --test` sin ficheros se iba a
  descubrir los `.ts` por su cuenta: fallaba, y el informe salía vacío con un 100 % redondo. El runner ahora
  recoge ese bundle y, si no hay ninguno, **falla** en vez de dar una cifra.
- **El informe medía el bundle, no `src/`.** Los sourcemaps inline no se aplican sin `--enable-source-maps`.
  Con él, el informe lista `src/back/index.ts` y `map.ts`. Las líneas de comentario cuentan como no
  cubiertas (esbuild las quita), así que el porcentaje de líneas sale por debajo del real.

**CL9**: el scaffolder no tiene harness ni e2e propios —su prueba es que lo que genera compila y pasa— y el
harness del core no cambia, así que no hay fila nueva en `docs/qa/test-metrics-history.md`. Sin tag (no es
una extensión).

## Backlog del tema

- 🔴 **Los runners existentes no pasan `--enable-source-maps`** (`senders/datadog`, `senders/file`,
  `senders/gitlab-issues`, `plugins/montag`, y probablemente todos los que salieron del mismo patrón): sus
  cifras de cobertura en los históricos miden el **bundle** —tests incluidos— y no `src/`. Hay que
  comprobarlo en cada uno y, si se confirma, anotarlo en su histórico al corregirlo: la cifra cambiará.
- Senders existentes sin `tests/` ni `docs/qa/` (nueve de doce). No se migran desde este plan.
- Corregir el `watch.mjs` de `datadog` en su próximo bump.
