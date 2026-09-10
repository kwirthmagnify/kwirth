# Backlog — censor

Pendientes vivos del plugin. La **guía de usuario** de censor no vive aquí: está en la documentación del
core, en `docs/0.5.287/guide/extensions/plugins/censor.md` (censor es público y se publica con el core).

## Ciclo de vida de assets y streams — ✅ HECHO (0.2.48)
- Inventario (containers que casan con las configs activas) **separado** del stream de logs: el stream solo
  se abre mientras algún runner que cubre el asset está analizando.
- Un cierre prematuro del stream (el cliente de k8s corta `follow` a menudo) **reconecta con backoff**
  (1s…30s, 20 intentos) en vez de borrar el asset; se aborta la petición al api server al parar.
- Se pide solo lo nuevo (`sinceSeconds`), nunca `tailLines`: el tail metía una línea histórica de **cada**
  container en el primer lote del LLM. Una reconexión recupera la ventana perdida, acotada a 300 s.
- Estado por asset (`idle`/`streaming`/`reconnecting`/`failed`) visible en la pestaña **Objects**.

## Autostart del análisis — ✅ HECHO (0.2.48)
- Un **único** switch para todo el canal (**Auto start what's ON**, bajo la lista de configs), guardado en
  su propia clave `censor-autostart`: al arrancar el channel se arranca el análisis de **todas** las configs
  ON, igual que pulsar Start. No viaja en el export/import (es preferencia de la instalación).
- No dispara si ninguna config ON tiene fuente configurada, la misma guarda que deshabilita el botón Start.

## Documentación propia del plugin
- Censor **no** tiene bundle de documentación propio (`docs/guide` + `censor.tgz`) como excubitor, montag,
  iter o pinocchio: su guía está en el árbol de docs del core. Si se quisiera publicar aparte (y entrar en
  la sección `docs` de `kwirth-dev.json` y del manifest), hay que decidir antes si la guía **se mueve** del
  core o **se duplica** — duplicar significa mantener dos copias.

## Testing
- **Cobertura del front**: los `.tsx` no están medidos numéricamente; el e2e cubre el panel y el diálogo de
  config, no las pestañas con datos (Regex/Logstream/Performance necesitan un run vivo con LLM y ruido).
- **e2e del autostart de comportamiento**: hoy el e2e comprueba el contrato de UI y cancela, para no gastar
  LLM real. Si algún día hay un LLM de mentira en el dev, se puede cerrar el ciclo completo (flag ON →
  rearrancar el channel → asertar que el botón pasa a **Stop**).
