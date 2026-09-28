# Kwirth Status v2 — Plan

> **ESTADO — VIVO** (2026-09-28). Cuelga de [PRD-v2.md](PRD-v2.md), que manda en el **qué** y el **por qué**.
> Segunda versión tras [PLAN.md](PLAN.md) (cerrado en `plugin/status@0.2.7`).
>
> Documento **append-only**: lo que se decide no se borra, se marca. Si algo de aquí contradice lo que ves
> en el producto, gana el producto.

## Lo que ya existe y no hay que construir

- Todo **status**: inventario, tabla con *Why*, grafo en capas (`StatusGraph.ts`, probado contra elk real),
  contadores de entregas, auto-refresco, líneas que frenan, nodos estables. Se reorganiza, no se reescribe.
- **recharts** en los globales del core (`window.__kwirth__.recharts`): las minigráficas de RF3 no suman
  bytes al bundle, igual que React Flow y elk.
- `clusterInfo.senders` y `clusterInfo.webhooks`: el patrón de acceso de solo lectura que RF6 extiende.

## Streams

Cada stream cierra con su CL9 completa.

### S1 — Las pestañas · PENDIENTE

- Pestañas con **enum** (regla de la casa): Providers y Graph con el contenido actual; Performance,
  Plugins y Extensions como pestañas que dicen que llegan en S2–S4. Refresco y hora de la foto, comunes.
- La pestaña 1 pasa a **solo providers y pluviders**; senders y webhooks siguen en el inventario (los usará
  la 5) pero salen de la tabla.
- Tests (harness + e2e) al día con las pestañas; guía `docs/0.6.31/channels/status.md` y sus capturas.
- **README dentro del paquete npm** (regla nueva del CL9): el `build.mjs` lo copia a `dist/`.

### S2 — Performance (RF3) · PENDIENTE

- Back: foto del proceso en cada refresco (`process.memoryUsage()`, `cpuUsage()` con su delta, retraso del
  event loop con `perf_hooks.monitorEventLoopDelay` solo mientras hay alguien mirando, uptime, versiones).
- Front: serie en memoria de la sesión y minigráficas con recharts. CPU % solo con dos fotos.

### S3 — El core expone plugins y extensiones (RF6) · PENDIENTE

- Accesos de solo lectura en `clusterInfo` por tipo, siguiendo el de senders/webhooks: plugins (con sus
  canales e instancias vivas), themes, homepages, logins, idps, aitoolsets, docs y packs.
- Tests en el back del core. Sin secretos ni URLs con token en lo expuesto.

### S4 — Plugins y Extensions (RF4, RF5) · PENDIENTE

- Pestaña 4: plugins, canales, instancias y conexiones.
- Pestaña 5: senders y webhooks (movidos de la 1) + los siete tipos de S3.
- Con un core sin S3, cada tipo que falte se dice como no disponible.

## Backlog

| # | Pendiente | Por qué no está hecho |
|---|---|---|

## Registro de decisiones

| fecha | decisión |
|---|---|
| 2026-09-28 | Nace el PRD v2: cinco pestañas. Se planteó renombrar el canal a `kwirth` y se **descartó** el mismo día —*"un channel que se llame kwirth es un follón de nombres"*—: se queda `status`. |
| 2026-09-28 | Se toca el core para exponer plugins y extensiones en solo lectura (RF6). |
| 2026-09-28 | Pestaña 1 solo providers y pluviders; senders y webhooks, a la 5. |
| 2026-09-28 | Performance con serie de sesión en el front; nada persistente, nada en segundo plano. |
