# Configuración del log del core

> **Estado: CERRADO el 2026-09-27** en su alcance original. CL9 completa: 514 tests en el core (+12
> nuevos), 2 specs e2e nuevos (9 casos), guía con dos capturas, histórico de métricas y sus dos PNG.
> `@kwirthmagnify/kwirth-common` publicado en **0.5.57** y la dependencia subida en back y front.
>
> 🟡 **Reabierto para el visor.** El punto pendiente —ver el log del core desde el front— está
> **entregado y validado** por el usuario el **2026-09-27**, sobre una imagen docker desplegada en el
> clúster (en el dev no se puede: no corre como pod). Queda **una sola cosa**: la captura de la guía,
> que necesita ese mismo despliegue. Ver *Pendiente*.

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

- ✅ **Ver el log del core desde el front** — **ENTREGADO y validado** el 2026-09-27, sobre una imagen
  docker desplegada en el clúster. 🟡 **Queda la captura de la guía** (ver el final de este punto).

  **Qué se hizo, y sobre todo qué NO se tocó.** La primera idea que se valoró fue montar un diálogo
  sobre el **canal `log`** apuntado al pod de Kwirth — hay precedente: `ContentExternal.tsx` de magnify
  ya monta el `TabContent` de otro canal fuera de su pestaña. Se descartó por decisión del usuario
  («no quiero tocar las otras cosas que ya están funcionando»), y el reconocimiento le dio la razón por
  partida doble: el canal `log` es un **plugin instalable** (el core pasaría a depender de una extensión
  para enseñar su propio log) y además **borra el ANSI** con `cleanANSI()`, con lo que el visor habría
  salido en blanco y negro — que era justo la mitad del encargo.

  Así que son dos piezas y ninguna toca nada que ya funcione:

  - `back/src/api/ManageKwirthApi.ts` → `GET /managekwirth/log`, al lado de `/previouslog` y con su
    misma puerta **admin-only**. Lee el contenedor **actual** con el mismo `readNamespacedPodLog` que
    ya usaba `PreviousContainerLog`, sin `previous`. `tailLines` viene de la query y se acota a
    1..10000. Un fallo contesta **200 con `unavailableReason`**, no un error: para quien mira, «no hay
    log y es por esto» es una respuesta.
  - `front/src/components/home/About.tsx` → botón *Core log* y su diálogo, con un `ansiToSpans` local
    de unas 20 líneas. Se pide **al pulsar**, no al abrir el About: el log anterior lo tiene el core en
    memoria, pero este es una lectura viva.

  **La decisión del ANSI, resuelta.** El conflicto que este plan dejó anotado —que interpretar ANSI le
  daba dos consumidores con intereses opuestos a la casilla *Colour the output*— **no se ha resuelto**,
  se ha esquivado: el visor interpreta los códigos que vengan. Si alguien apaga *Colour the output*
  para llevarse un log limpio a un fichero, **el visor se queda en gris**. Es el comportamiento que hay
  hoy y está sin discutir.

  ⚠️ **Solo con Kwirth corriendo como POD.** `inCluster` solo se pone a `true` en `index.ts:279`, la
  rama que lee su propio pod; desktop, docker y ECS lo dejan en `false`. Una imagen lanzada con
  `docker run` enseñará el motivo, no el log: hay que desplegarla **en Kubernetes**. Es la misma
  limitación que habría tenido la vía del canal `log`.

  🔴 **Un verde que no probaba nada, cazado al hacer la captura.** El segundo caso del e2e —el que
  comprueba que los escapes ANSI **no** llegan a pantalla como texto, que es el único que valida el
  visor— estaba escrito como un `if/else`: con líneas, asertaba; sin líneas, asertaba el motivo. Como el
  dev **no corre como pod**, siempre se iba por la rama vacía y **la corrida salía verde igualmente**,
  afirmando que el visor estaba verificado cuando la aserción que importa no se había ejecutado nunca.
  Se reportó como «2 casos pasan» y era cierto y engañoso a la vez. Ahora es un `test.skip()` explícito:
  donde no hay log que pintar sale **⏭, no ✅**. El patrón es general y merece recordarse — *un caso que
  se adapta al entorno en vez de saltarse convierte la suite en un sello de goma*.

  **Estado de la CL9**: 1 harness ✅ (514) · 2a e2e ✅ (`about-core-log`: **1 ✅ / 1 ⏭** en dev) ·
  2b histórico ✅ · 2c los dos PNG ✅ · 3 QA manual ✅ (el usuario, sobre el clúster) · 4 guía ✅ *sin
  captura* · 5 backlog ✅ · 6 plan ✅ · 7-9 commit y push.

  🟡 **Lo único que queda: la captura.** `capture-about-core-log.spec.ts` está escrito y **no se puede
  correr en el dev** —no hay líneas que fotografiar—, así que la sección de la guía va **sin imagen**,
  al revés que su hermana. Se saca apuntando a un Kwirth desplegado:
  `KWIRTH_E2E_URL=<url> playwright test --config playwright.capture.config.ts capture-about-core-log.spec.ts`
  y luego se añade `![The core's own log](_media/guide/admin-about-core-log.png)` al final de
  *Reading the core's own log* en `docs/0.6.31/guide/admin/01-deployment.md`.
- **`API Security` junto a `User security`** en el drawer: una con mayúscula y otra sin ella, siendo el
  mismo tipo de entrada. Señalado y no tocado.
