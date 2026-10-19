# Plan — El endpoint de Trivy no comprueba ningún permiso

> **Estado: ✅ CERRADO en `trivy` 0.2.32** (2026-10-19), validado en dev por el usuario. El endpoint y el
> arranque quedaron resueltos en **0.2.30** (2026-10-17); lo que mantenía el plan abierto —el scope
> `trivy$kubernetes`, que se concedía y no filtraba nada— se cierra en **0.2.32** (§7), junto con un
> agujero mayor que apareció al tirar del hilo: los informes no estaban limitados por la clave.
>
> Lo que sigue abierto no es de este plan: vive en **A12** y **A13** de
> [auth-hardening](../../auth-hardening/PLAN.md).
>
> Hallazgo del
> mismo día, al revisar si `excubitor` y `trivy` compartían el patrón de
> [fileman-target](../fileman-target/PLAN.md). `excubitor` **está bien** (§4); `trivy` no lo estaba.
>
> El agujero se verificó leyendo el código y **no se ejecutó**: por decisión del usuario, *«es código
> viejo inacabado»*, y confirmarlo habría significado instalar o desinstalar un operador.
>
> **Lo entregado va más allá del endpoint**, porque al probarlo apareció algo peor: ver §6.

---

## 1. El agujero

`trivy` declara una escalera de scopes y **no la consulta nunca**. Su manejador ni siquiera recibe la
clave:

```ts
// plugins/trivy/src/back/index.ts:84
async endpointRequest(endpoint: string, req: Request, res: Response): Promise<void> {
```

El contrato del core pasa un cuarto parámetro `accessKey`; aquí no está declarado, así que **no hay
nada que comprobar y nada se comprueba**. Y lo que hay detrás no es una lectura:

| `?action=` | qué hace |
|---|---|
| `install` | `applyAllResources(trivyOperatorYaml, clusterInfo)` — **aplica el bundle completo del Trivy Operator al clúster** |
| `remove` | `deleteAllResources(trivyOperatorYaml, clusterInfo)` — **lo borra** |
| `status` | lee un ConfigMap de `trivy-system` |

Lo único que hace falta para llegar es **una accessKey válida, cualquiera**: la ruta del core aplica
`validKey` y `processHttpChannelRequest` llama a `getKey`, y ambos son **autenticación**, no
autorización.

🔴 **Es más amplio que el de File Manager.** Aquel exigía además una sesión del canal abierta
(`socket.find`); aquí no hay sesión que exigir. Cualquier usuario autenticado de Kwirth —aunque no
tenga ningún scope de Trivy— puede **instalar o desinstalar un operador en el clúster**.

⚠️ Y el borrado es el lado peor: `remove` sobre una instalación de Trivy que alguien esté usando es
destrucción de servicio, no un cambio de configuración.

## 2. La escalera existe y está muerta

```ts
getChannelScopeLevel = (scope) => ['', ETrivyScope.WORKLOAD, ETrivyScope.KUBERNETES, 'cluster', 'admin'].indexOf(scope)
```

`trivy$workload` y `trivy$kubernetes` **sí** se declaran en `getScopeCatalog()` y **sí** se pueden
conceder (plan `ops-trivy-scopes`), de modo que el administrador los ve en el editor y cree que acotan
algo. Para el streaming puede que sí; **para este endpoint, no**.

Es el mismo patrón que ya ha aparecido cuatro veces: *un permiso que se concede y no hace nada*
(`groups` que la puerta no mira — [A10](../../auth-hardening/PLAN.md), los scopes de Agora que no gradúan,
los de File Manager que no se podían conceder, y ahora éste).

## 3. Qué hay que hacer

1. **Confirmarlo**, como se hizo con File Manager: con una clave **sin** scopes de Trivy, llamar a
   `?action=status`. Es la acción inocua de las tres — no instala ni borra nada. Si responde, está
   demostrado.
2. **Declarar el cuarto parámetro** `accessKey` en `endpointRequest` y exigir un scope por acción:
   - `status` → el mínimo del canal (leer si está instalado no es administrar).
   - `install` / `remove` → el más alto. 🔴 Instalar un operador es una operación de **clúster**, no de
     canal: probablemente deba exigir `cluster`/`admin` y no un `trivy$*`, porque quien puede escanear
     no tiene por qué poder modificar el clúster.
3. **Reutilizar el helper**, no copiarlo. `excubitor` ya tiene `hasScopeKey()` y `fileman` tiene
   `scopeAllows()` desde la 0.2.27: son la misma función escrita dos veces, y ésta sería la tercera.
   Sitio natural: `common-back`.
4. **Tests**: sin scope → 403; con scope → pasa. Y que no pasen por vacuidad.

💡 Menor, de paso: `console.log(`[trivy] endpointRequest: ${endpoint} ${req.method} ${req.url}`)` en la
línea 85 escribe la **URL completa** sin pasar por el logger del canal, así que no se puede filtrar ni
silenciar.

## 4. `excubitor` está bien, y sirve de modelo

Revisado en la misma pasada y **no tiene este problema**. Su `endpointRequest` recibe la clave, rechaza
endpoints desconocidos y corta antes de actuar:

```ts
if (!this.hasScopeKey(accessKey, EExcubitorScope.POLICY_ADMIN)) { res.status(403).send(...); return }
```

🔴 **Corrección de un supuesto mío**: al encontrar lo de File Manager escribí que `excubitor` y `trivy`
tenían *"la misma forma, el mismo riesgo"*. Era una extrapolación hecha desde la **declaración** de los
endpoints, sin leer su código. Para `excubitor` era falsa.

ℹ️ Observado sin juzgarlo: su `testRunner` hace un `fetch` a una URL que llega en el cuerpo. Está
detrás de `POLICY_ADMIN` y es la función *"probar la conexión con el runner"*, así que es deliberado;
queda dicho por si algún día se revisa la superficie de salida.

---

## 6. Lo entregado (0.2.30) — y lo que apareció al probarlo

El endpoint era la mitad del problema. Al dárselo a probar al usuario salió lo otro:

> **«usuario sin scopes arranca el canal pero no ve resultados»**

🔴 **Arrancar el canal no comprobaba NADA.** Trivy se declaraba `cluster: false, resourced: false`, así
que el core lo trataba como **canal autónomo** y entraba por una rama que llama a `addObject` con los
selectores vacíos **sin mirar un solo scope** ([`index.ts:998`](../../../back/src/index.ts#L998)).
Cualquier clave válida veía los informes del clúster: vulnerabilidades, secretos detectados y auditoría
de configuración.

⚠️ **Y la rama de `cluster` tampoco comprueba**, al contrario de lo que afirmé en un primer momento
leyendo el plan `channel-start-rbac` en vez del código. Las dos entregan y ninguna mira:

```
rama autónoma   →  addObject('', '', '')             sin chequeo
rama cluster    →  addObject('*all','*all','*all')   sin chequeo
```

### Lo que se hizo, y dónde

🔴 **Todo en el plugin, sin tocar el core.** Es lo que ya hacen Agora y Excubitor: el canal recibe el
`instanceConfig` con la clave dentro y `addObject` **devuelve un booleano**, así que puede negarse él
mismo. Agora lo hace exactamente así con `agora$user`.

| capa | qué decide | exige |
|---|---|---|
| **arranque** (`addObject`) | abrir el canal y ver informes | `trivy$user` |
| **endpoint** | `?action=status` | `trivy$user` |
| | `install` / `remove` | **`cluster`** |

- **`cluster: true`** en `getChannelData`: declara lo que el canal realmente es, en vez de pasar por
  autónomo.
- **`trivy$workload` → `trivy$user`** (ruptura). Hacía dos trabajos a la vez —poder *usar* Trivy y
  poder *ver* informes de workload—, así que no expresaba ninguno. Las claves que lo lleven **no
  conceden nada** hasta que se re-concedan.
- **El front pinta la denegación.** Su `case START` solo leía `signalMessage.instance` —ni `text` ni
  `level`—, así que la negativa del canal se tiraba y la pestaña quedaba **vacía y sin error**. Y como
  el core manda `'Instance Config accepted'` **antes** de llamar a `addObject`, el canal "arranca"
  igualmente; lo que el plugin puede hacer es no asignar el `instanceId` y avisar.

### 🔴 Dos vueltas atrás, y por qué importan

El gate del arranque pidió primero **`cluster`**, y hubo que deshacerlo: `cluster` está **por encima**
de los dos scopes de Trivy en la escalera, así que exigirlo dejaba `trivy$user` y `trivy$kubernetes`
**imposibles de usar** — quien podía entrar ya los superaba. Lo destapó el usuario en dos pruebas: una
clave con solo `cluster` entraba y veía todo, y una con solo `trivy$user` recibía *«requires the
'cluster' scope»*. Es, por quinta vez en el mismo día, **un permiso que se concede y no hace nada**.

## 7. Lo que queda abierto

- ~~🔴 **`trivy$kubernetes` no filtra nada.**~~ ✅ **Cerrado en `0.2.32`** (2026-10-19). No se implementó
  la segunda capa: al mirarlo de cerca **no había nada que separar**, porque el canal nunca pide los
  informes de ámbito clúster —su lista son los cuatro *namespaced*—. El scope **se elimina** (🔴 ruptura:
  una clave que lo lleve no concede nada hasta re-concederle `trivy$user`) y lo que acota pasa a ser lo
  mismo que en el resto del producto: los **recursos** de la clave.
  ⚠️ **Y había un agujero mayor debajo**: hasta `0.2.31` el canal filtraba **lo que la pantalla pedía**,
  no lo que la clave alcanzaba, así que abrir Trivy en vista de clúster entregaba los informes —y los
  **secretos detectados**— de todos los namespaces. Desde `0.2.32`, `keyMatchesResource` sobre el
  namespace es lo **primero** de `matchesScope`.
- **El core sigue sin comprobar scope al arrancar** ningún canal autónomo ni de clúster. Trivy se
  defiende solo; los demás canales no-resourced, cada uno verá. El §4.1 de
  [channel-start-rbac](../channel-start-rbac/PLAN.md) lo pedía y no se hizo.
- **Consolidar el helper.** `hasScopeKey` (excubitor), `scopeAllows` (fileman) y `scopeAllows` (trivy)
  son la misma función escrita tres veces. Sigue perteneciendo a `common-back`.
  ⚠️ **Y ya no basta con `common-back`**: en `0.2.32` el **front** de trivy tuvo que deshabilitar
  *Manage* sin `admin`, y desde el front no se alcanza `common-back`, así que se escribió una copia más
  (`keyReaches`, en `src/common/`). Es la misma conclusión a la que llegó magnify. El sitio es `common`,
  y queda apuntado en **A13** de [auth-hardening](../../auth-hardening/PLAN.md).

💡 De paso se quitaron dos botones muertos del diálogo *Manage*: **FILESYSTEM** y **IMAGE**
(`configfs`/`configimg`). Aparecen **una sola vez en la historia del repositorio** —en el commit que
convirtió Trivy en plugin— y **nunca en el back**, así que caían en el `default` del `switch` y
respondían `500 Invalid action`. El modo está fijo en filesystem.
