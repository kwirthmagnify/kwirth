# Configuración del log del core

> **Estado: CERRADO el 2026-09-27.** CL9 completa: 514 tests en el core (+12 nuevos), 2 specs e2e nuevos
> (9 casos), guía con dos capturas, histórico de métricas y sus dos PNG. `@kwirthmagnify/kwirth-common`
> publicado en **0.5.57** y la dependencia subida en back y front.

## Por qué

El log del core es lo único que queda cuando algo va mal dentro del cluster, y **no se podía configurar
nada de él**:

- Los componentes habilitados eran una **constante del módulo**: `[chan, core, prov, send]`. `auth` y
  `stor` estaban **mudos y no había forma de encenderlos** sin recompilar. Un fallo de autenticación o de
  almacenamiento se lo tragaba el propio log.
- **No había filtro por nivel.** O pasaba todo lo del componente, o nada. Con quince providers escribiendo
  a la vez, seguir a uno era leerlo todo.
- `ansiLog` se podía tocar por la variable `ANSILOG`, pero **no sobrevivía a un reinicio**.

El caso que lo motivó es de esta misma sesión: cuatro líneas de `auth` —`validNamespaces`,
`validControllers`, `validPods`, `validContainers`— volcando listas internas en **cada arranque de
instancia**. El usuario no podía quitarlas: estaban marcadas como `info`, así que silenciarlas exigía
apagar todo `auth` y perder con ellas lo que sí importa.

## Decisiones

Tomadas por el usuario, no negociadas aquí:

| decisión | qué se hace |
|---|---|
| granularidad | **nivel por componente**, y además **por id**: `chan:excubitor` gana a `chan` |
| los errores | **nunca se silencian**, ni con el componente en `off`. El filtro baja el ruido, no esconde fallos |
| por defecto | **todo encendido**, a `info`. Quien quiera menos, lo baja; nadie tiene que descubrir que un componente existe para empezar a verlo |
| cuándo aplica | **en caliente**, sin reiniciar: el log es justo lo que se sube mientras algo va mal |
| dónde se guarda | en `IKwirthSettings.log`, el mismo ConfigMap que el resto de ajustes |
| *Reset to defaults* | **solo del log**, y el botón solo aparece en su pestaña: en las otras, «defaults» sería vaciar los marketplaces y los registros |

## Lo que se decidió por el camino

**El front no conoce el enum.** El back publica los componentes y sus ids en
`GET /core/settings/log/components`, igual que el catálogo de scopes RBAC. Mover `ELogComponent` a
`common` habría sido reescribir el import de **47 ficheros** del back para un desplegable, y dejaría dos
listas que mantener sincronizadas — que es exactamente el fallo que esto evita.

**Los ids se recogen solos.** `componentLogger(component, id)` los anota al crearse, y eso ocurre cuando
arranca cada canal, provider o sender. Lo que el diálogo ofrece es lo que **puede escribir de verdad**, sin
registro que enchufar ni lista que mantener. Un plugin que nunca se ha abierto no tiene logger, así que
tampoco hay nada suyo que configurar.

**`ELogLevel` viaja como tipo, no como valor.** En el front se usan literales tipados y `import type`: CRA
transpila con Babel, que no distingue tipo de valor, y un import normal deja el `require` en el bundle. Con
la copia de `kwirth-common` que webpack sirviera aún sin recargar, `ELogLevel` llegaba `undefined` y el
diálogo entero reventaba. Pasó.

## Hallazgos

🔴 **Los overrides por id se descartaban en silencio.** La validación de `applyLogSettings` comprobaba la
clave entera contra los seis componentes, y `chan:excubitor` no es ninguno: se tiraba ahí mismo. El diálogo
lo guardaba, lo mostraba de vuelta y el canal seguía escribiendo al nivel de su componente — indistinguible
de funcionar salvo comprobando si trazaba. **Lo cazaron los tests nuevos, no el QA manual**, que ya lo
había dado por bueno.

⚠️ **El import del bundle no aplicaba el log.** `writeSettings` escribía el ConfigMap y nada más, así que
una configuración importada quedaba guardada pero **no vigente** hasta el siguiente reinicio, con el
diálogo enseñando una cosa y el core escribiendo otra. Ahora aplica.

⚠️ **`Kwirth portability` casi desaparece.** El export/import del diálogo de settings mezclaba **dos
cosas** bajo los mismos dos botones: un formato propio (`kwirth-settings`, solo ajustes del core) y el
bundle de portabilidad, que además lleva lo de las extensiones. Al quitar el primero se iba el segundo, y
era el **único consumidor de `/core/config-bundle/*` en todo el front**. Se recuperó como diálogo propio
con su entrada de menú.

## Pendiente

- **Ver el log del core desde el front**, leyendo los logs del pod, con formateo ANSI. Pedido por el
  usuario en esta misma sesión. Hay pieza reutilizable: `PreviousContainerLog` ya lee el log del
  contenedor por `readNamespacedPodLog`. ⚠️ **Decisión que trae consigo**: si el visor interpreta ANSI,
  la casilla *Colour the output* pasa a tener dos consumidores con intereses opuestos — apagarla para que
  el log salga limpio a un fichero dejaría el visor en blanco y negro. Probablemente el visor deba colorear
  por su cuenta a partir del nivel y el componente, sin depender de los códigos del back.
- **`API Security` junto a `User security`** en el drawer: una con mayúscula y otra sin ella, siendo el
  mismo tipo de entrada. Señalado y no tocado.
