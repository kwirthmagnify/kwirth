# PLAN — Webamp Plugin

## Estado: EN CURSO

## Objetivo

Crear un plugin OSS `webamp` para Kwirth: un reproductor de música Winamp 2
clon (Webamp de Jordan Eldredge) que corre en un iframe dentro de una pestaña
de Kwirth, con drag-and-drop de audio y skins.

## Streams

### S1 — Scaffolding y estructura base ✅
- [x] Ejecutar `tools/create-kwirth-plugin.mjs --id webamp`
- [x] Copiar `webamp.js` (webamp-offline) a `src/front/webamp/webamp.txt`
- [x] Personalizar `package.json` (icono, deps, scripts)
- [x] Personalizar `build.mjs` / `watch.mjs` (loader `.txt`, globals)
- [x] Crear `build-docs-tgz.mjs`
- [x] Crear `.gitignore`, `README.md`, `NOTICE.md`

### S2 — Back channel ✅
- [x] Back minimalista (solo contrato IChannel, sin storage ni processCommand)
- [x] Tracking de instancias

### S3 — Front channel ✅
- [x] `WebampMachine.ts` — gestor del iframe (patrón galaga: host div + attach/detach/dispose)
- [x] `WebampChannel.tsx` — ciclo de vida start/pause/continue/stop
- [x] `WebampTabContent.tsx` — área del iframe + HUD + fullscreen bar
- [x] `WebampSetup.tsx` — diálogo de configuración minimal
- [x] `WebampConfig.ts` / `WebampData.ts` — config y estado
- [x] `icons.tsx` / `IriaPlayLogo.tsx` — icono y logo

### S4 — Tests y docs ✅
- [x] Test unitario del backchannel (3 tests, pasan)
- [x] Guía docsify (user + admin + credits)
- [x] README.md con enlace a Kwirth

### S5 — Build y verificación ✅
- [x] `npm install --legacy-peer-deps`
- [x] `npm run build` — typecheck OK, front.js + back.js + dist/package.json
- [x] `npm test` — 3/3 pass
- [x] `build-docs-tgz.mjs` — docs/webamp.tgz generado

### S6 — E2e y QA (PENDIENTE)
- [ ] Crear estructura e2e (playwright config + helpers)
- [ ] QA manual con el usuario
- [ ] Capturas de pantalla
- [ ] Histórico de métricas

## Notas

- El plugin es OSS (repo público, npm público con scope `@iriaoperae`)
- `requiresRestart: false` — el back no necesita reinicio
- El Webamp library (~940 KB) se bundlea como texto en `front.js`
- No hay storage ni scores — el reproductor es stateless desde el servidor
- El iframe sobrevive tab switches (patrón machine en `channelObject.data`)
