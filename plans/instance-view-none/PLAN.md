# View `none` — canales que no necesitan el clúster · PLAN

> Cambio de **core**. Afecta al contrato de canales y al selector de recursos, que usan todos los
> canales, así que tiene superficie de regresión propia.
> Estado: **decisiones cerradas 2026-09-11**, implementación pendiente.
> Origen: al arrancar el plugin `sugarless` (glucosa vía LibreLinkUp) se constató que un canal que no
> necesita **nada** del clúster no tiene forma de arrancarse sin pedir acceso de clúster.

---

## 1. El problema, con el código delante

Un canal se arranca con una **view** (`EInstanceConfigView`): `cluster`, `namespace`, `group`, `pod`,
`container`. Todas describen **recursos de Kubernetes**. Un canal cuyo dato no vive en el clúster —
sugarless lee glucosa de una API en internet — no encaja en ninguna.

Hoy la única salida es declarar `cluster: true` y arrancarse con view `cluster`. Y eso es lo que hace
el core en `back/src/index.ts:761`:

```
logWarning('A cluster-wide access key has been received for starting instance')
await channel.addObject(webSocket, instanceConfig, '*all', '*all', '*all')
```

Es decir: **se pide una llave de ámbito de clúster para abrir una puerta que no existe**, y el core lo
registra como tal en el log. Para un canal que no va a mirar un solo pod, eso es privilegio
injustificado y ruido en la auditoría.

### Lo que ya existe y no hay que inventar

`EInstanceConfigView.NONE = 'none'` **ya está declarado** en `common/src/InstanceConfig.ts:53`, y se usa
internamente (el canal `metrics` y `front/src/App.tsx:1371`). Lo que falta es cablearlo como view
seleccionable y como camino de arranque.

### Y un matiz que este cambio NO resuelve

Los scopes **no están atados a un canal**: `ResourceIdentifier` (`common/src/AccessKey.ts:128`) lleva
`scopes`, `namespaces`, `groups`, `pods`, `containers` y ningún campo de canal. Cada canal traduce el
nombre del scope con *su propia* escalera (`getChannelScopeLevel`).

- **`none` ya aísla entre canales de recursos.** Las escaleras de `log`
  (`['','filter','view','cluster']`) y `metrics` (`['','snapshot','stream','cluster']`) no lo incluyen,
  así que un recurso con `scopes:'none'` da nivel −1 ahí y **no concede nada**.

### CORRECCIÓN (2026-09-11): el scope NO es el gate de estos canales

La primera versión de este plan —y el mensaje del commit `48c65392`— afirmaban que conceder `none`
habilitaba de golpe `echo`, `agora`, `iter` y `provider-debug`. **Es falso**, por dos razones que solo
se ven trazando el arranque de verdad:

1. **El nivel exigido lo fija el front de cada canal, no la escalera.** El core compara
   `haveLevel >= requestedLevel`, donde `requestedLevel` sale de `instanceConfig.scope`, que es lo que
   devuelve el `getScope()` del canal (`AuthorizationManagement.checkAkr`, líneas 223-224).
   `agora` e `iter` piden `EInstanceConfigScope.CLUSTER` (nivel 2), así que un usuario con `none`
   (nivel 1) **no llega**. Solo `echo` y `provider-debug` piden `NONE`.

2. **Y en el arranque de un canal cluster o autónomo el scope no se mira.** La rama de la view
   `cluster` en `processStartInstanceConfig` llama a `addObject` **sin pasar por `checkAkr`**, y la del
   canal autónomo tampoco. El scope solo se evalúa en el camino de **recursos** (dentro de la
   resolución de pods) y en los endpoints HTTP (`validAuth`). El aviso de *"cluster-wide access key"*
   es una línea de log, no una decisión de autorización.

**El gate real es `loginKey.enabledChannels`** (`back/src/index.ts:1180`): la lista de canales que el
usuario puede lanzar, `undefined` = todos. Y eso **ya es por canal**, que era justo la carencia que se
temía.

Consecuencia práctica: con `enabledChannels` poblado se concede sugarless sin conceder echo, agora ni
iter. Con `enabledChannels` vacío el usuario puede lanzar cualquier canal, y el scope no lo impide para
los de view `cluster`/`none`.

Los scopes por canal siguen siendo un punto legítimo del roadmap V2 —el vocabulario compartido es real
para el camino de recursos— pero **no son un bloqueo para este cambio** ni para sugarless.

---

## 2. Decisiones cerradas (2026-09-11)

| # | Decisión |
|---|---|
| 1 | Un canal declara que se invoca con view `none` poniendo **`cluster: false` y `resourced: false`** en `getChannelData()`. Sin campo nuevo en `BackChannelData`. |
| 2 | Alcance **mínimo**: solo la view `none`. Nada de scopes por canal. |
| 3 | Este plan propio, por ser cambio de core que afecta a todos los canales. |
| 4 | Elegir un canal autónomo **pone la view en `none` automáticamente**: es la única view en la que puede funcionar, así que pedírsela al usuario es pedirle que adivine. |
| 5 | Se aprovecha para pasar al enum las **7 comparaciones con literal de string** que ya había en `ResourceSelector` (`view==='pod'`, `view!=='namespace'`…). |

**Por qué la decisión 1 no rompe nada:** hoy la combinación de las dos banderas en `false` es
**inservible** — no existe ninguna vía de invocación para ese canal, así que ningún canal la usa.
Darle el significado "solo view none" ocupa un hueco vacío en vez de añadir contrato.

---

## 3. Cambios

### 3.1 Core — `back/src/index.ts`, en `processStartInstanceConfig`

Añadir, **antes** de la rama de `cluster`, el camino del canal autónomo: si el canal tiene las dos
banderas en `false` y la view es `NONE`, se llama a `addObject` una sola vez con los tres selectores
**vacíos**, sin resolver pods y **sin el aviso de clave cluster-wide**, que ahí no aplica.

Se pasan cadenas vacías y no `'*all'` a propósito: `'*all'` significa "todos los recursos" y aquí el
significado es "ningún recurso", que no es lo mismo aunque el canal ignore los tres parámetros.

### 3.2 Front — `front/src/components/ResourceSelector.tsx`

Son **siete** puntos de edición, no tres. `view===EInstanceConfigView.CLUSTER` aparece hoy en las
líneas 252, 283, 394, 402, 419 y 488, y todas necesitan su rama.

1. **`onChangeView`** (~176): **el hallazgo importante.** Su rama no-Docker llama a
   `loadAllNamespaces()`, así que seleccionar `none` dispararía un `GET /config/namespace` — justo lo
   que este cambio quiere evitar. Y a un usuario sin permiso para listar namespaces le saltaría un
   `MsgBoxOkError` solo por elegir la view. La view `none` tiene que **salir antes** de ese bloque,
   limpiando la selección de recursos y sin tocar la red.
2. **`onChangeChannel`** (~245): si el canal elegido tiene las dos banderas en `false`, poner la view
   en `none` (decisión 4).
3. **Opción en el selector de View** (~394): añadir `none`.
4. **`addable()`** (~283): `view === NONE` es arrancable sin exigir namespaces, igual que `cluster`.
5. **`onAdd()`** (~252): nombre de pestaña para la view `none`.
6. **Gate por canal** (~488): con view `none`, habilitar solo los canales con las dos banderas en
   `false`; un canal autónomo ya queda deshabilitado en la view `cluster` por el `!c.cluster` actual.
7. **Selectores de namespace/controller/pod/container** (402, 419): deshabilitados con view `none`,
   igual que ya lo están con `cluster`.

Y el estado `view` pasa de `useState('')` a estar tipado con el enum, con las 7 comparaciones
literales convertidas (decisión 5).

**Lo que NO cambia, y es correcto que no cambie:** la view `none` sigue exigiendo elegir clúster, porque
lo que se elige ahí no es *qué se inspecciona* sino **en qué Kwirth corre el canal**. Sugarless
necesita saber qué backend le sirve la glucosa.

### 3.3 Contrato — `common/src/Channel.ts`

Solo **comentario**: documentar en `BackChannelData` que `cluster:false` + `resourced:false` significa
"se invoca únicamente con view `none`". El significado tiene que estar donde está el contrato, no solo
en este plan.

---

## 4. Regresión: qué hay que revisar antes de dar esto por bueno

`ResourceSelector` lo usa **todo canal**, así que el riesgo no está en sugarless sino en no romper lo
que ya funciona:

- [ ] Las cinco views existentes siguen ofreciéndose y arrancando igual (`log` por namespace, `metrics`
      por pod, `fileman` por controller, `ops` por container, `magnify` por cluster).
- [ ] Los tabs por defecto de `front/src/tools/Constants.ts` (`all-namespaces-log`,
      `all-groups-fileman`, `all-pods-metrics`, `all-containers-ops`) siguen abriéndose.
- [ ] Un canal cluster-scoped ya existente (`excubitor`, `iter`, `provider-debug`) sigue arrancando con
      view `cluster` y su aviso en el log.
- [ ] `addable()` no se vuelve permisivo para las views de recursos.
- [ ] El canal autónomo no aparece seleccionable en las views de recursos.
- [ ] Restaurar una pestaña guardada de cualquier canal existente sigue repoblando sus desplegables
      (`updateResource` tiene ahora una salida temprana para la view `none`).
- [ ] Elegir la view `none` con un canal no autónomo seleccionado lo deselecciona, en vez de dejar un
      ADD que el back rechazaría.

### Dos hallazgos más aparecidos al implementar

1. **`updateResource` también llamaba al clúster sin condición.** Es la ruta de restaurar una pestaña
   guardada, y hacía `GET /config/namespace` antes de mirar la view. Mismo problema que
   `onChangeView`: petición inútil, y error para quien no tenga permiso de listar namespaces.
2. **La view `none` no reseteaba el canal.** `onChangeView` hace `setChannel('')` en su rama normal;
   al salir antes para `none` había que decidir qué hacer, y se deselecciona solo si el canal que
   había no es autónomo.

### Hallazgo aparte, NO se toca en este cambio

Hoy el gate por canal solo cubre `cluster`: un canal con `resourced: false` **sí** se ofrece bajo las
views `namespace`/`pod`/`container`, donde no puede funcionar. Le pasa ya a `excubitor` e `iter`.
Arreglarlo es correcto pero cambia el comportamiento de plugins existentes, así que queda anotado y
fuera de este alcance.

---

## 5. Fases

**F1 — El cableado.** Los tres cambios de §3 y la checklist de regresión de §4. El MVP es que
sugarless (o cualquier canal con las dos banderas en `false`) arranque con view `none` y que nada de lo
anterior cambie.

**F2 — e2e.** Un test que arranque un canal autónomo con view `none` y compruebe que el log del core
**no** emite el aviso de clave cluster-wide. Esa ausencia es justo el objetivo del cambio, así que es
lo que hay que asertar.

**F3 — Documentación.** Página de la guía sobre views, y la nota en el contrato de canales para quien
escriba un plugin que no necesite el clúster.
