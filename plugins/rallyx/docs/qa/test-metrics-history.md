# Rally-X (plugin) — histórico de métricas de test

> Registro **incremental** de la suite del plugin, una fila por **CL9 / tag**. Se **añade** una fila
> arriba en cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`) en `plugins/rallyx/`.
> - **Cobertura** = `COVERAGE=1 npm test`.
> - **e2e** = `plugins/rallyx/e2e/` (Playwright aislado, con su propio `.creds.json`).
>   Se lanza con `node_modules\.bin\playwright test` desde ese directorio.

| Fecha | Versión / tag | Harness | Cobertura global (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-10-03 | `plugin/rallyx@0.1.0` | **6** | 57.76% / 100% / 30.23% | 2 / 13 | Primer cierre. Plugin de canal privado de pago. Juego Rally-X (Phaser 2.x + RequireJS) bundled en front como text+base64, corre en iframe aislado con srcdoc. Fix crítico: escape de `</script>` en phaser.txt (2 ocurrencias) que rompía el script tag y dejaba el código visible como texto. Back channel autónomo con scores en ConfigMap. Harness cubre el backchannel (instancia, storage, channel data, getInstances). e2e cubre ciclo de vida del canal, iframe/canvas, aspect ratio 4:3 y captures. |

## Qué cubre cada fichero del harness

| Fichero | Tests | Qué fija |
|---|---|---|
| `tests/backchannel.test.ts` | 6 | Instanciación del back, requisito de storage, channel data autónomo (cluster:false, routable:false, resourced:false), conteo de instancias/conexiones vacío, containsInstance/containsConnection negativos. |

## Pendiente sobre la propia suite

- **El guardado de récord no se prueba end-to-end.** Sería destructivo: escribiría en la tabla
  compartida del cluster. El camino está cubierto por el harness a ambos lados.
- **La cobertura de funciones es baja (30.23%)** porque el harness solo cubre el backchannel
  estático. El back de scores (processCommand, sanitize, notifyRecord) requiere un mock de
  websocket más elaborado.
