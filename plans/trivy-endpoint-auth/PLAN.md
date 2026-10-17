# Plan — El endpoint de Trivy no comprueba ningún permiso

> **Estado: sin empezar.** Hallazgo del **2026-10-17**, al revisar si `excubitor` y `trivy` compartían
> el patrón de [fileman-target](../fileman-target/PLAN.md). `excubitor` **está bien** (§4); `trivy` no.
>
> ⚠️ **Verificado leyendo el código, NO ejecutado.**

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
(`groups` que la puerta no mira — [A10](../auth-hardening/PLAN.md), los scopes de Agora que no gradúan,
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
