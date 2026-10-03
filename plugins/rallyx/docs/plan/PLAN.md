# PLAN — IRIA Rally-X Plugin

**Estado:** ✅ CERRADO (0.1.0)
**Versión:** 0.1.0
**Tipo:** plugin privado (scope `@iriaoperae`)

## Objetivo

Crear un plugin de Kwirth que ejecuta el juego Rally-X (recreación homebrew de Marco Parenzan)
dentro de una pestaña, con persistencia de high-scores en ConfigMap del cluster.

## Arquitectura

- **Front:** iframe aislado con Phaser 2.x + RequireJS + assets inline (data URIs). Machine pattern
  que sobrevive tab switches (host div `position:fixed` en `document.body`).
- **Back:** persiste high-scores en ConfigMap vía `writeStorage`. Notifica al sender configurado
  cuando se bate el récord.
- **Comunicación:** postMessage bridge del iframe al plugin (estado del juego + game-over).
- **Assets:** todo bundleado en el front.js (text + base64), sin peticiones de red.

## Streams

### S1 — Scaffolding y juego base ✅
- [x] Scaffold con `tools/create-kwirth-plugin.mjs`
- [x] Descargar y adaptar el juego upstream (named AMD defines, cookie→localStorage, postMessage bridge)
- [x] Bundlear Phaser + RequireJS + assets como text/base64
- [x] RallyxMachine (iframe manager con attach/detach/dispose)
- [x] RallyxChannel (IChannel impl)
- [x] RallyxTabContent (HUD + game area + scores overlay)
- [x] RallyxSetup (dialog con sender select + pauseOnBlur)
- [x] Back channel (score persistence + notify)
- [x] Fix crítico: escape de `</script>` en phaser.txt (2 ocurrencias rompían el script tag)
- [x] Build (typecheck + esbuild) pasa
- [x] Harness tests (6/6 verdes)
- [x] E2E tests (13/13 verdes)
- [x] Guía docsify (user + admin + credits)
- [x] Capturas generadas (channel-stopped, setup-dialog, game-running)
- [x] Registrado en `back/kwirth-dev.json`
- [x] QA manual validado
- [x] Commit + tag + push
- [x] Publish a Nexus privado (@iriaoperae/kwirth-plugin-rallyx@0.1.0)

## Pendiente (futuro)
- Cobertura de funciones baja (30.23%) — mock de websocket más elaborado para processCommand
- Guardado de récord no se prueba e2e (sería destructivo)
