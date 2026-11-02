# PLAN — Scaffolder de senders

> Cuelga de [PRD.md](PRD.md). **Estado: VIVO, sin empezar** (2026-11-02). Streams definidos y validados con
> el usuario; no se ha escrito código.
>
> Cada stream cierra su **CL9 completo**, con el punto 3 como gate.

| stream | qué | dónde | estado |
|---|---|---|---|
| **S1** | `tools/create-kwirth-sender.mjs` + su fila en `tools/README.md` | core (repo público) | ⏳ sin empezar |

El primer consumidor es el sender `graylog`, de pago, que tiene su propio plan en el repo privado y arranca
cuando S1 esté cerrado.

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

## S1 · `create-kwirth-sender.mjs`

**Entra**: el script (RF1–RF12 del PRD) y la fila de la tabla de `tools/README.md`.

**Validación**:

- Generar en el scratchpad las cuatro combinaciones del criterio de aceptación; en cada una
  `npm install`, `npm run build`, `npm test`, y comparar el `dist/package.json` del watch con el del build.
- `--into-existing` sobre una carpeta con un README y un `docs/plan/` escritos a mano: los conserva.
- QA manual: el usuario lo lanza en modo interactivo.

**CL9**: el scaffolder no tiene interfaz ni harness propio; su prueba es que lo que genera compila y pasa.
El histórico de métricas va en la fila del core si el cierre lo pide.

## Backlog del tema

- Senders existentes sin `tests/` ni `docs/qa/` (nueve de doce). No se migran desde este plan.
- Corregir el `watch.mjs` de `datadog` en su próximo bump.
