# Configuración de extensiones: un solo almacén, y los AI toolsets dentro — PLAN

> **ESTADO — 📝 VALIDADO** (2026-11-18): streams, tipos y decisiones P1-P4 validados por el usuario. Producto, problema y decisiones D1-D9 en el [PRD](PRD.md): aquí no se repiten.
>
> Estado del código verificado el 2026-11-18. Las rutas son relativas a la raíz del repo.

## 1. Estado verificado del código

### 1.1 Almacenes

- `ISecrets` (`back/src/tools/ISecrets.ts`) y `IConfigMaps` (`back/src/tools/IConfigMap.ts`) tienen los
  mismos métodos: `read`, `write`, `writeKey`, `readAllKeys`, `list(prefix)`, `delete`, `storeLimit`.
- Hay implementación de Secrets en los tres modos de almacén (`back/src/index.ts:622-645`):
  - `KubernetesSecrets`: los valores de `data` tienen que ir ya en base64. Límite de 800 KiB.
  - `NodeSecrets` (escritorio): ficheros cifrados AES-256-GCM.
  - `DockerSecrets`: ficheros JSON.

  Por tanto, mover a Secret no deja fuera ningún modo de despliegue.

### 1.2 Configuración de instalación por familia

| familia | almacén hoy | API | esquema | ¿llega en caliente? | desinstalar | export |
|---|---|---|---|---|---|---|
| router | Secret `kwirth-router-<id>-config`, `{data: base64(JSON)}` (`RouterManager.ts:68, 211-232`) | GET/PUT `/core/routers/:id/config` | `instance.getConfigSchema()`; `[]` si no hay instancia | sí, `applyConfig` | borra el Secret (`:444`) | **no se exporta** |
| provider | ConfigMap `kwirth-provider-<id>-config` (`ProviderManager.ts:450-457`) | GET/PUT `/core/providers/:id/config` | en vivo, o cacheado en `kwirth-provider-<id>-schema`, o `devSchemas` | no: `configure(cfg)` solo al arrancar o instalar (`index.ts:1888, 2560, 2598`) | sí (`:357`) | entera, **sin redactar** (`CoreManagedConfig.ts:54-62`) |
| plugin | ConfigMap `kwirth-plugin-<id>-config` (`PluginManager.ts:393-399`) | GET/PUT `/core/plugins/:id/config` | `configSchema` del package.json; nadie lo declara | el plugin la pide con `getPluginConfig` | sí (`:379`) | entera, sin redactar (`:44-52`) |
| login | dentro del ConfigMap `kwirth-login-<id>`, junto a meta y fondo (`LoginManager.ts:101-107`) | GET `/core/logins/:id/config` **sin autenticar** (lo pide la página de login); PUT con clave; `updateConfig` **fusiona** un parcial (`:394`) | `meta.configSchema`; valores iniciales de `login.json` del tgz | el front la pide | va con el payload (`:362`) | **no se exporta** |
| IdP | Secret **compartido** `kwirth-idps`, una clave por instancia (`IdpManager.ts:16, 373-403`) | `/core/idps/instances[...]`, con scope admin | `connector.getConfigSchema()` | por llamada (`AuthApi.ts:211, 260`) | borra sus instancias una a una (`:306-309`) | redactado (`CoreManagedConfig.ts:168-226`) |
| sender | ConfigMap **compartido** `kwirth-sender-configs`, una clave por sender, `ISenderStoredConfig` (`SenderManager.ts:168-181, 583-590`) | GET/PUT/POST/DELETE `/core/senders/:id/configs[...]` | `getConfigSchema?()` en vivo | `addConfig` con `{...comunes, ...config}` | sí (`:451`) | redactado (`:79-117`) |
| webhook | ConfigMap **compartido** `kwirth-webhook-configs` (`WebhookManager.ts:165-187, 633-639`) | las mismas que sender, más URL y rotación | `getConfigSchema?()` | `addConfig` | sí, configs y tokens (`:432-436`) | redactado (`:120-158`) |
| aitoolset | — | — | — | — | — | solo concesiones (`:240-260`) |

Lo común a todas:
- **Ninguna** aplica `default` ni valida en el back. Solo el front pre-rellena los valores por defecto (`ConfigFormDialog.tsx:92`, `ConfigListDialog.tsx:190`) y comprueba `required` en las listas.
- `persistSenderConfig` y `persistWebhookConfig` escriben sin `await`: un fallo de escritura no llega a nadie.

### 1.3 Hallazgos que el PLAN resuelve de paso

1. **Webhooks pierden sus campos `common`.** Solo se persiste `configs` (`WebhookManager.ts:633-639, 666`), aunque el front envía `{...comunes, configs}`. Con el helper se guarda la forma entera, así que se arregla solo.
2. **Senders conservan código de migración** (array suelto y clave antigua `data`, `SenderManager.ts:171-181`). Contradice la regla de DEV y se elimina al reescribir la lectura.
3. **`loadDevIdpConfigs` está muerto** (`IdpManager.ts:478-499`, nadie lo llama). Se conecta, porque es la pata de fichero JSON que exige el PRD.

### 1.4 IdP: cómo se referencia una instancia

- El id de una instancia es una cadena libre, y en la práctica **es igual al id del conector**: el front crea las instancias con `id: connectorId` (`IdpConfigDialog.tsx:74`).
- Muchos sitios la referencian **solo por su id, sin conocer el conector**:
  - las rutas `/core/auth/<instanceId>/start|callback`, que además registra el IdP externo (`AuthApi.ts:149-158, 195, 250`);
  - el `state` de OAuth;
  - `IUser.idp` en `kwirth-users`;
  - `ISignupRequest.idp` en `kwirth-signups`;
  - el selector de vinculación de usuarios.

### 1.5 AI toolsets

- **El host se construye en cada llamada a una tool.** `buildToolHost(requires, context, providers)` (`common-ai/src/back.ts:1091-1125`) se llama dentro del `execute` de cada invocación (`:1330`). Hay un segundo camino, `invokeToolRef` (`:1134-1138`), que hoy no usa ningún plugin.
- **Plugins y core comparten la misma copia de `common-ai`** a través de `global.__kwirth_back__`. El core le pasa datos con setters (`setToolsetGrants`, `setUsageService`…).
- **`listToolsetInfos()` copia campo a campo** (`:1073-1082`): un `configSchema` nuevo se perdería si no se añade ahí.
- **`AiToolsetManager` solo recibe `IConfigMaps`** (`AiToolsetManager.ts:109`), no `ISecrets`.
- **`AiToolsetGrantDialog`**:
  - mide 960×600 fijos;
  - pide `/catalog`, `/core/plugins` y `/grants`;
  - tiene botones Save y Cancel.
- **Ningún diálogo de extensiones usa Tabs.** El precedente con enum es `ESettingsKwirthTab` (`SettingsKwirth.tsx:38`).
- **`kwirth-dev.json`** ya tiene `senderConfigs`, `webhookConfigs` e `idpConfigs`, pero no `aitoolsetConfigs`.
- **Documentación**: la guía de toolsets (usuario y autor) es `docs/0.6.31/guide/extensions/aitoolsets/index.md`.

## 2. Diseño

### 2.1 Decisión sobre IdP (delegada por el PRD)

**Un Secret por INSTANCIA**: `kwirth-idp-<instanceId>-config`, con el `IIdpInstanceConfig` completo (que
ya lleva `connectorId`).

- Todo el core la busca por id de instancia sin saber el conector (§1.4). Con un Secret por instancia,
  esa búsqueda sigue siendo **una lectura directa**, en vez de leer todo y filtrar como hoy.
- Como en la práctica instancia = conector, el nombre coincide con el patrón `kwirth-<tipo>-<id>-config`.
  Si mañana hay dos instancias de un mismo conector, el modelo ya lo admite.
- Listar instancias es `secrets.list('kwirth-idp-')`. Desinstalar un conector es listar, filtrar por
  `connectorId` y borrar.

### 2.2 El helper: `ExtensionConfigStore` (back)

Fichero nuevo `back/src/tools/ExtensionConfigStore.ts`. Lo construye el core con `ISecrets` y lo reciben
los ocho managers.

```ts
class ExtensionConfigStore {
    constructor(secrets: ISecrets)
    read(type: EExtensionType, id: string): Promise<unknown>        // lo guardado tal cual, o undefined; ilegible → aviso + undefined
    write(type: EExtensionType, id: string, value: unknown): Promise<void>
    delete(type: EExtensionType, id: string): Promise<void>
    list(type: EExtensionType): Promise<string[]>                   // ids con configuración guardada
}
```

- **Nombre** `kwirth-<type>-<id>-config`, con `type` = valor de `EExtensionType`. Formato
  `{ data: base64(JSON) }`, el mismo que hoy usan los routers, así que **los routers no pierden nada**.
- **El almacén no conoce la forma.** Guarda lo que le den: un objeto (forma simple), un
  `ISenderStoredConfig` / `IWebhookStoredConfig` (forma múltiple) o un `IIdpInstanceConfig`.
- **Escrituras siempre con `await`.** Un fallo vuelve al llamante y la API responde con error (§1.2).

### 2.3 Valores por defecto y validación: funciones puras en `kwirth-common`

En `common/src/ExtensionConfig.ts`, junto a `isConfigFieldEnabled`, que ya vive ahí:

```ts
applyConfigDefaults(schema: IConfigFieldDef[], values: Record<string, unknown>): Record<string, unknown>
validateConfig(schema: IConfigFieldDef[], values: Record<string, unknown>): IConfigValidationError[]
pruneConfig(schema: IConfigFieldDef[], values: Record<string, unknown>): Record<string, unknown>   // quita lo que no está en el esquema
```

- **Por qué en `common`**: el front puede usar las mismas funciones para validar antes de enviar, y así
  front y back aplican la misma regla.
- **El coste de exportar valores ya está asumido** (comentario de `TConfigFieldType`): los artefactos solo
  importan tipos de aquí, y `isConfigFieldEnabled` ya es un valor que vive en este fichero.
- **Quién las llama**: los managers, no el almacén.
  - Forma simple: antes de guardar, `pruneConfig` + `validateConfig`; al leer, `applyConfigDefaults`.
  - Forma múltiple: lo mismo por cada configuración con nombre, y sobre los campos `common` de la base.
- **Qué comprueba `validateConfig`**:
  - `number` es número finito;
  - `boolean` es booleano;
  - `select` está en `options`;
  - cada valor de `multiselect` (separado por comas) está en `options`, si hay `options`;
  - `json` se parsea;
  - `required` solo si `isConfigFieldEnabled`.

  `text`, `password` y `textarea` solo exigen que sean cadenas.
- **Error de API**: `400 { error, fields: IConfigValidationError[] }`. El mensaje nombra los campos.
- **Si el esquema no está disponible** (por ejemplo, un router sin instancia viva): no se valida, se
  guarda lo que llega y se registra un aviso. La validación no puede bloquear configurar una extensión
  rota para arreglarla.

### 2.4 Tipos nuevos (a validar por el usuario)

| tipo | dónde | forma |
|---|---|---|
| `IConfigValidationError` | `common/src/ExtensionConfig.ts` | `{ field: string, message: string }` |
| `IAiToolsetInfo.configSchema` | `common-ai/src/index.ts` (campo nuevo) | `configSchema?: IConfigFieldDef[]` |
| `IToolHost.config` | `common-ai/src/back.ts` (campo nuevo) | `config: Record<string, unknown>`, siempre presente |
| `TAiToolsetConfig` | `common-ai/src/index.ts` | `Record<string, unknown>`, análogo a `TRouterConfig` |
| `EAiToolsetDialogTab` | `front/src/components/extensions/AiToolsetDialog.tsx` | `GRANTS = 'grants'`, `SETTINGS = 'settings'` |

No hay más tipos nuevos. Las formas múltiples reutilizan `ISenderStoredConfig`, `IWebhookStoredConfig` e
`IIdpInstanceConfig`.

### 2.5 AI toolsets en el core

- **Back**:
  - `AiToolsetManager` recibe el `ExtensionConfigStore`.
  - Endpoints nuevos `GET/PUT /core/aitoolsets/:id/config`, con el mismo guardia que `PUT /grants/:id` (clave válida + scope `admin`).
  - `GET` devuelve los valores vigentes (`applyConfigDefaults`), secretos reales. `PUT` hace `pruneConfig` + `validateConfig` + escribir.
- **`common-ai`**:
  - `listToolsetInfos()` copia también `configSchema`.
  - Setter nuevo `setToolsetConfig(toolsetId: string, config: TAiToolsetConfig | undefined)`, con el **mismo patrón que `setToolsetGrants`**: un `Map` en memoria del módulo. `undefined` lo borra.
  - El core lo llama:
    - al arrancar (`loadAll` + dev);
    - al instalar o actualizar;
    - al guardar (`PUT /:id/config`);
    - al importar;
    - y con `undefined` al desinstalar.

    El valor que pasa ya lleva aplicados los `default`.
  - En `:1330` y en `invokeToolRef`, `host.config` sale de ese mapa (`{}` si no hay entrada). **Ninguna invocación lee el Secret.**
  - Un cambio guardado vale desde la invocación siguiente en la réplica que guardó. Con varias réplicas, el comportamiento es el mismo que hoy tienen las concesiones (P3).
- **Ciclo de vida**: desinstalar borra la configuración (en `uninstall` y en `uninstallFromPack`). Actualizar la conserva.
- **`kwirth-dev.json`**: sección `aitoolsetConfigs: { <id>: {...} }`, con interpolación `${VAR}` y la misma semántica que `senderConfigs`: solo en memoria, gana sobre lo guardado y no se persiste.
- **Export/import**: el `coreConfig` del toolset pasa de `{ grants }` a `{ grants, config }`, redactando los secretos si `includeCredentials` es falso.

### 2.6 Front

- **El diálogo**: `AiToolsetGrantDialog.tsx` pasa a ser `AiToolsetDialog.tsx`, con el mismo tamaño fijo de 960×600.
  - Tabs con `EAiToolsetDialogTab` y `value` explícito en cada `<Tab>`.
  - La pestaña Settings está deshabilitada, con tooltip, si el toolset no declara esquema.
- **La pestaña Settings** pinta `ConfigFields` (el renderer, no `ConfigFormDialog`, que es un diálogo entero) en una columna de alto fijo con scroll interior.
- **Un solo Save** guarda lo que haya cambiado en las dos pestañas (`PUT /grants/:id` y `PUT /:id/config`). Cancel lo descarta todo.
- **Errores de validación**: un 400 se muestra en el campo, y la pestaña con errores se marca.
- **Título del diálogo**: `AI toolset: <name>`.

### 2.7 Export/import homogéneo

Como todas las familias pasan por el mismo almacén, el export también se homogeneiza:
- **Redacción de secretos en todas** las familias cuando `includeCredentials` es falso. Hoy provider y
  plugin salen sin redactar.
- **Router y login entran en el bundle**: hoy no se exportan. Es lo que pide el requisito de "export/import"
  para toda configuración del core.

⚠️ Esto **cambia lo que hace hoy el export** para provider, plugin, router y login. Va como decisión
**P1** para validar (§5).

## 3. Se pierde configuración de dev (D8)

Antes del stream de cada familia se avisa al usuario de qué se va a perder, para que lo saque con
☰ Kwirth export o lo copie a mano.

| familia | qué se pierde | stream |
|---|---|---|
| router | nada (mismo nombre y formato) | S2 |
| provider | `kwirth-provider-<id>-config` | S3 |
| plugin | `kwirth-plugin-<id>-config` (vacía en la práctica) | S3 |
| login | la configuración editada; al reinstalar, vuelve la de `login.json` | S4 |
| IdP | `kwirth-idps` (instancias de GitHub/Google/Entra) | S5 |
| sender | `kwirth-sender-configs` | S6 |
| webhook | `kwirth-webhook-configs`; los tokens se conservan (no son configuración) | S6 |

Los ConfigMaps y Secrets viejos quedan huérfanos en los clusters. No se escribe código para limpiarlos:
**al acabar (S11)** se limpian a mano en cada cluster de Kubernetes donde haya un Kwirth de dev (usuario,
2026-11-18). Primero se listan los objetos huérfanos y se confirman con el usuario, y solo después se
borran.

## 4. Streams

Orden pensado para que cada stream deje el sistema funcionando y se pueda validar por separado.

| stream | entrega | validación | depende de |
|---|---|---|---|
| **S1. Helper y validación** | `ExtensionConfigStore`; `applyConfigDefaults`/`validateConfig`/`pruneConfig`; `IConfigValidationError`. Publicar `kwirth-common` (bbp) | unit: cada tipo de campo, `required` + `enabledWhen`, descarte de campos viejos, ilegible → aviso, `list`, `delete`, codificación base64 | — |
| **S2. Router** | `RouterManager` sobre el helper (mismo Secret); validación en `PUT` | unit + e2e del diálogo de routers: configurar, guardar, valor inválido rechazado; los tests actuales de routers sin cambios | S1 |
| **S3. Provider y plugin** | Secret en vez de ConfigMap, defaults y validación. Provider sigue aplicando al arrancar o instalar, como hoy | unit + e2e del diálogo de un provider con contraseña (ojo, guardar, recargar) | S1 |
| **S4. Login** | la configuración sale del payload a su Secret, sembrada desde `login.json` al instalar. `PUT` sustituye entero (fuera el merge parcial). `GET` sigue sin autenticar | e2e: editar la configuración de un login y verla aplicada en la pantalla de login | S1 |
| **S4b. Desinstalar conserva la configuración** | confirmación al desinstalar en todas las familias (`MsgBoxYesNo` con casilla "Also delete its configuration", desmarcada, solo en las familias con `keepsConfig`); `DELETE …?deleteConfig=true`, sin él se conserva; router, provider, plugin, login y pack (a sus miembros) | unit por familia: conserva / borra; e2e: desinstalar con y sin la casilla, reinstalar recupera la conservada | S2-S4 |
| **S5. IdP** | un Secret por instancia (§2.1); `idpConfigs` de `kwirth-dev.json` conectado; `deleteConfig` (P5); fuera el enmascarado de secretos y su merge (`SECRET_MASK`, `onRevealSecret`): viajan reales y el diálogo los tapa con el ojo (CLAUDE.md, usuario 2026-11-18) | unit + e2e: crear instancia, login por IdP, desinstalar el conector con la casilla borra sus instancias, sin ella las conserva | S1, S4b |
| **S6. Sender y webhook** | un Secret por extensión con su forma múltiple (`NamedConfigs.ts`: poda y validación por configuración y de la base; un campo `json` con el valor ya como objeto es válido, que es como lo guardan los senders con diálogo propio); campos `common` de webhook persistidos y entregados al artefacto y a `verify()`; escrituras con `await`, primero el Secret y después la memoria; un documento vacío borra el Secret; fuera la migración de senders; `keepsConfig` + `deleteConfig` (P5), y los tokens de webhook siguen a la casilla: sin ella se conservan y la URL sigue valiendo al reinstalar. Los contratos publicados `ISenderAccess.addConfig` e `IWebhookAccess.rotateToken` siguen síncronos; el core usa `saveConfig` / `rotateTokenAndSave` | unit + e2e de `ConfigListDialog`: crear, editar, borrar configuración con nombre; campo común conservado tras recargar | S1 |
| **S7. Export/import** ✅ | redacción en todas las familias; router y login en el bundle (si P1 = sí). Hecho: una sola redacción (`redactSecretFields`, ConfigFieldSecrets); plugin, provider, router y login comparten adaptador y viajan como `installConfig`, **solo lo guardado** (sin guardar no viaja nada, ni defaults; el de login, solo lo del admin, no `login.json`); sin esquema y sin credenciales → `omitted` + aviso al importar; un `saveConfig` que lanza es un aviso. El webhook viaja como `stored: {...base, configs}` y se siguen leyendo los ficheros con `configs` sueltos | unit de `CoreManagedConfig` por familia: con y sin credenciales, ida y vuelta | S2-S6 |
| **S8. Toolsets: contrato y core** ✅ (common-ai 0.5.81; P5 = desinstalar sin la casilla conserva configuración Y concesiones, y reinstalar las devuelve; export `{ grants, config }` / `configOmitted`; `buildToolHost` gana un 4º parámetro `config`) | `configSchema`, `host.config`, `setToolsetConfig`, endpoints, ciclo de vida, `aitoolsetConfigs`, export. Publicar `kwirth-common-ai` (bbp) | unit: toolset sin esquema → `{}`; con esquema → defaults; guardar → la siguiente llamada ve el valor; desinstalar con `deleteConfig` borra configuración y concesiones, sin él las conserva (P5) | S1, S7 |
| **S9. Toolsets: diálogo** ✅ | `AiToolsetDialog` con pestañas. Hecho: un solo Save (concesiones primero, luego settings); el tooltip de Settings deshabilitada va con `describeChild`, para que su nombre accesible siga siendo "Settings" | e2e: pestaña deshabilitada sin esquema; formulario, guardar, recargar; error de validación en el campo; concesiones como antes | S8 |
| **S10. Documentación y scaffolder** | guía de toolsets (pestaña Settings, cómo declarar `configSchema` y leer `host.config`); capturas regeneradas; el scaffolder genera un `configSchema` de ejemplo comentado | revisión de la guía; build del scaffolder con y sin esquema | S9 |

| **S11. Limpieza de los clusters** | en cada cluster con un Kwirth de dev, borrar los objetos huérfanos: `kwirth-provider-*-config`, `kwirth-plugin-*-config`, `kwirth-sender-configs`, `kwirth-webhook-configs` (ConfigMaps) y `kwirth-idps` (Secret) | listado de lo huérfano confirmado con el usuario antes de borrar; los `kwirth-<tipo>-<id>-config` de extensiones no instaladas se listan aparte como **configuración conservada** (P5), no como basura; después, cada familia sigue funcionando | S1-S10 |

Cada stream acaba en un punto de parada para tu QA, con QA en el k3d **por familia** a medida que cada
una pasa al helper. Los e2e son no destructivos y restauran solo lo que
leyeron.

## 5. Decisiones del PLAN

Del usuario, 2026-11-18:

- **P1. Export homogéneo** (§2.7): se redactan los secretos en provider y plugin, y router y login entran
  en el bundle. La misma regla para las ocho familias.
- **P2. Sin esquema disponible no se valida** (§2.3): se guarda y se registra un aviso, para no bloquear
  la reparación de una extensión rota.
- **P3. La configuración de un toolset vive en memoria de `common-ai`**, cargada y actualizada por el core
  con `setToolsetConfig`, igual que las concesiones (§2.5). Se descartaron leer el Secret en cada
  invocación (excesivo), una vez por turno, y una caché con caducidad.
- **P4. Tipos nuevos de §2.4 validados.** Los 10 streams de §4 también, en ese orden.
- **P5. Desinstalar conserva la configuración salvo que se pida** (S4b, usuario 2026-11-18): la
  confirmación de desinstalar lleva la casilla "Also delete its configuration", desmarcada, como el
  force de Magnify al borrar un pod. Solo aparece en las familias que guardan configuración (un flag
  `keepsConfig` en el descriptor): en las demás sería una opción que no hace nada. En la API,
  `DELETE …?deleteConfig=true`; sin el parámetro se conserva, para que un cliente que no conoce la
  casilla no borre nada. La configuración conservada vuelve sola al reinstalar.

## 6. Fuera de este PLAN (apuntado para el backlog)

- **`kwirth-webhook-tokens`** es una credencial al portador (el token es la URL del webhook) guardada en
  un ConfigMap. No es configuración de instalación, pero debería ir a un Secret.
- **Las rutas antiguas `/export` e `/import` de senders** (`SenderApi.ts:58-111`) pierden la base
  `common`. Ya las sustituye ☰ Kwirth export.
- **Borrar una instancia de IdP no limpia los usuarios ni las solicitudes de alta vinculados** a ella.
- **Un provider no aplica en caliente la configuración guardada** (hace falta reinstalarlo o reiniciar).
- **El GET de configuración de login no tiene autenticación**, por diseño. Si un login guarda
  `autoPassword`, ese valor es público. No cambia con este PLAN.
