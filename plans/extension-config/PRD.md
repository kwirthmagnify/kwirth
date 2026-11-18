# Configuración de extensiones: un solo almacén, y los AI toolsets dentro — PRD

> **ESTADO — ✅ CERRADO** (2026-11-18): decisiones validadas por el usuario; lo de IdP lo decide el PLAN. Documento de PRODUCTO: qué se
> hace y por qué. El cómo irá en el PLAN (`PLAN.md`, al lado), que se escribe después de cerrar este.
>
> Antecedentes: [ai-tools/PLAN.md](../ai-tools/PLAN.md) (el modelo de toolsets),
> [completed/ai-tool-grants/PRD.md](../completed/ai-tool-grants/PRD.md) (la concesión por tool, que vive
> en el mismo diálogo) y [config-portability/PRD.md](../config-portability/PRD.md) (el export/import).

## Resumen ejecutivo

Dos cosas que van juntas:

1. **Un solo almacén de configuración de extensiones en el back** (el *helper*). Hoy cada manager guarda
   la configuración de instalación de sus extensiones a su manera: Secret o ConfigMap, uno por extensión
   o uno compartido, con o sin base64, con o sin validación. Pasan **todos** a usar la misma pieza, que
   guarda en un Secret, aplica los valores por defecto del esquema y valida al guardar.
2. **Los AI toolsets se suman al mecanismo común de configuración.** Declaran campos `IConfigFieldDef`, el
   admin los edita en el gestor de AI toolsets (pestaña *Settings*, junto a *Grants*), y las tools los
   reciben al ejecutarse.

**Criterio de éxito:**
- Todas las extensiones con configuración (providers, logins, IdPs, routers, senders, webhooks, plugins y
  AI toolsets) la guardan y leen a través del helper, en Secrets con el mismo nombre de patrón, y sus
  diálogos funcionan igual que hoy.
- Un toolset de escritura declara *"namespaces en los que no se escribe nunca"* con un valor por defecto.
  El admin lo cambia en *Settings*, y la siguiente llamada de la IA respeta el valor nuevo, sin reiniciar
  ni reinstalar. El valor viaja en ☰ Kwirth export y vuelve con el import.

## El problema

### Cada manager guarda la configuración a su manera

| extensión | dónde guarda hoy | observación |
|---|---|---|
| router | Secret por router, `kwirth-router-<id>-config`, JSON en base64 | el único que ya hace lo correcto |
| provider | **ConfigMap** por provider, `kwirth-provider-<id>-config` | contraseñas en un ConfigMap |
| plugin | **ConfigMap** por plugin, `kwirth-plugin-<id>-config` | ningún plugin declara esquema todavía |
| login | dentro del ConfigMap del login, junto a sus metadatos | contraseñas en un ConfigMap |
| IdP | un Secret **compartido** por todas las instancias, una clave por instancia | |
| sender | un ConfigMap **compartido**, `kwirth-sender-configs`, una clave por sender | varias configuraciones con nombre; contraseñas en un ConfigMap |
| webhook | un ConfigMap **compartido**, `kwirth-webhook-configs`, una clave por webhook | ídem |
| AI toolset | **nada** | |

Son siete formas de hacer lo mismo. Las consecuencias:
- **Credenciales en ConfigMaps** (providers, logins, senders, webhooks), que cualquiera con `get
  configmaps` en el namespace de Kwirth puede leer.
- **Ninguno valida contra el esquema al guardar.** Lo que manda el front se persiste tal cual.
- **Valores por defecto aplicados en cada sitio** (o en ninguno).
- **Borrado al desinstalar desigual.** Cada manager se acuerda, o no, de limpiar lo suyo.

### Los AI toolsets no tienen configuración

El engranaje de un toolset abre `AiToolsetGrantDialog`, que solo decide quién usa qué tools. Todo lo que
una tool necesite saber de la instalación (límites, listas de exclusión, valores por defecto) tiene que
ir fijo en su código, y cambiarlo exige publicar una versión nueva.

El caso que lo destapa es el primer toolset que **crea y borra** recursos del cluster: necesita una lista
de namespaces protegidos, que es distinta en cada instalación y la decide el admin. Hay más casos del
mismo tipo: un tope de réplicas, o los registros de imágenes admitidos.

## Lo que ya es común y no cambia

- **El contrato de campos**: `IConfigFieldDef` en `kwirth-common` (`common/src/ExtensionConfig.ts`).
- **Los renderers**: `ConfigFields` / `ConfigFormDialog` (una configuración) y `ConfigListDialog`
  (varias con nombre).
- **La regla**, ya escrita en `PluginDescriptor.ts`: *"one way of configuring an extension, not one per
  family"*. Este PRD la lleva también al almacenamiento.

## Personas

- **Admin de Kwirth**: configura cualquier extensión igual, con la misma seguridad para las credenciales,
  y ajusta los toolsets a su instalación sin pedir una versión nueva.
- **Autor de una extensión** (core o de terceros): declara el esquema y recibe la configuración ya
  validada y con valores por defecto. No cambia nada de lo que escribe hoy, salvo que sea un toolset y
  quiera configuración.
- **Quien mantiene el core**: una sola pieza que entender, probar y endurecer, en lugar de siete.

## Objetivos

1. Un helper único en el back para guardar, leer y borrar la configuración de instalación de una
   extensión, con valores por defecto y validación contra su esquema.
2. **Todos** los managers con configuración lo usan: provider, login, IdP, router, sender, webhook, plugin
   y AI toolset.
3. Toda configuración de extensión en **Secrets**, nunca en ConfigMaps.
4. Que un AI toolset declare campos, el admin los edite junto a la concesión, y las tools reciban los
   valores vigentes en cada ejecución, sin reinicio.
5. Las tres patas exigidas a toda configuración del core: **fichero JSON**, **export/import** y
   **edición desde el front**, también para los toolsets.

## No-objetivos

- **Cambiar el contrato de campos o los renderers del front.** `IConfigFieldDef`, `ConfigFormDialog` y
  `ConfigListDialog` se quedan como están (salvo la pestaña nueva de toolsets).
- **Configuración por plugin o por concesión** en los toolsets (*"Agora puede escribir en `demo`,
  Pinocchio no"*). Una sola, de la instalación (decisión del usuario, 2026-11-18).
- **El DCE.** No tiene configuración que edite el admin; sus almacenes `configMaps`/`secrets` son para su
  propio estado. Si algún día la necesita, usará el helper.
- **Themes, homepages, docs y packs**: no tienen configuración.
- **Lo que no es configuración de instalación**: los índices de extensiones, el código guardado
  (`-back`, `-front`), los esquemas cacheados de providers, los tokens de webhooks, las concesiones de
  toolsets. Se quedan donde están.
- **Migración de lo ya guardado.** Ver D8.
- **Un tipo de campo "lista".** Se usan los que hay (`multiselect` como texto separado por comas, o
  `textarea` con un valor por línea).

## Conceptos

- **Configuración de instalación**: los valores que el admin da a los campos que una extensión declara.
  Se conserva al **actualizar** la extensión y se borra al **desinstalarla**.
- **Forma simple / forma múltiple**: una configuración por extensión (provider, login, router, plugin, AI
  toolset), o varias con nombre (sender, webhook, IdP con sus instancias). El helper guarda las dos; la
  diferencia la conoce el manager, no el almacén.
- **Esquema**: la lista de `IConfigFieldDef` que la extensión declara.
- **Valor vigente**: lo guardado y, para cada campo sin guardar, su `default`.

## Requisitos funcionales

### El helper (todas las extensiones)

- **R1. Un Secret por extensión**, con el nombre `kwirth-<tipo>-<id>-config`. Dentro va la
  configuración en forma simple o múltiple.
- **R2. Leer** devuelve el valor vigente: lo guardado completado con los `default` del esquema. Si lo
  guardado no se puede leer, se registra un aviso y se trata como vacío. El arranque de Kwirth nunca
  falla por una configuración ilegible.
- **R3. Guardar** valida contra el esquema: tipo, `required` de los campos habilitados (`enabledWhen`) y
  valores dentro de `options`. Si algo no encaja, se rechaza con un error que **nombra el campo**. Los
  campos que ya no están en el esquema se descartan. Se persiste lo que llega, secretos incluidos (no hay
  merge de "campo vacío = no lo cambies").
- **R4. Borrar** al desinstalar. Lo hace el helper, llamado desde el camino común de desinstalación de
  cada manager, no a mano en cada uno.
- **R5. Secretos.** Se devuelven **reales** en el `GET` de configuración y el front los enmascara con el
  ojo, como ya hacen todos los diálogos. Nunca se mandan a un LLM.
- **R6. Comportamiento visible igual que hoy** en providers, logins, IdPs, routers, senders, webhooks y
  plugins: mismos diálogos, mismas APIs, mismo export/import. Lo único que cambia para el admin es que un
  valor inválido ahora se rechaza al guardar.

### Los AI toolsets

- **R7. Declaración.** `IAiToolsetInfo` gana `configSchema?: IConfigFieldDef[]`. Si falta o está vacío,
  el toolset no tiene configuración.
- **R8. Entrega a las tools.** `IToolHost` gana `config`, con los valores vigentes del toolset de la tool.
  Como `trace`, se presta siempre y no es una capacidad. Es un objeto vacío si el toolset no declara
  esquema. Se lee **en cada ejecución**: guardar surte efecto en la siguiente llamada, sin reinicio.
- **R9. Pantalla.** El engranaje de la tarjeta abre un diálogo con dos pestañas: **Grants** (lo de hoy) y
  **Settings** (`ConfigFormDialog` pintado desde el esquema). Sin esquema, *Settings* se ve
  **deshabilitada**, nunca oculta, con el motivo como tooltip (*"This toolset declares no settings"*).
- **R10. Ciclo de vida.** Al instalar rigen los `default`. Al actualizar se conserva lo guardado (R3
  descarta los campos que desaparecen). Al desinstalar se borra (R4).
- **R11. Fichero JSON.** La configuración de un toolset se puede dar en `kwirth-dev.json`, con
  interpolación `${VAR}`, como las demás extensiones.
- **R12. Export/import.** Viaja en ☰ Kwirth export como `coreConfig` de la entrada del toolset (vía
  `CoreManagedConfig`), junto a sus concesiones. Los secretos siguen la regla del export sin
  credenciales que ya existe.
- **R13. Toolsets del core** (bundled): pueden declarar esquema igual que los instalados.

### Transversal

- **R14. Textos de UI, logs y errores en inglés.**

## Decisiones

Del usuario, 2026-11-18:

- **D1. Reutilizar el contrato y los renderers existentes** (`IConfigFieldDef`, `ConfigFormDialog`,
  `ConfigListDialog`). Ningún tipo de campo ni editor nuevo.
- **D2. En los toolsets, una configuración por toolset instalado**, global a la instalación, no por
  plugin.
- **D3. Helper único, y TODAS las extensiones con configuración se adaptan a él** en este trabajo, no
  "cuando se toquen". Homogeneizar es un objetivo en sí.
- **D4. El DCE no entra.**
- **D5. Siempre en Secret**, nunca en ConfigMap. Cualquier campo puede ser una credencial, y hoy cuatro
  familias las guardan en ConfigMaps. **Toda** la configuración va al Secret, también los campos que no
  son secretos. Se descartó partir por campo (secretos a un Secret, el resto a un ConfigMap) por tres
  razones:
  - Un objeto por extensión es más simple que dos que hay que recomponer.
  - Sin esquema disponible no se sabe qué es secreto.
  - Hay campos sensibles marcados como `text` (URLs con token, cadenas de conexión).

  El coste es que, para inspeccionar la configuración con `kubectl`, hay que decodificar el base64
  (usuario, 2026-11-18).
- **D6. Un Secret por extensión** (`kwirth-<tipo>-<id>-config`), también para las que hoy comparten uno
  (IdPs, senders, webhooks). Desinstalar es borrar un objeto, y una extensión no puede estropear la
  configuración de otra al escribir.
- **D7. `host.config` siempre prestado** en los toolsets, no una `ECapability` nueva: declarar el esquema
  ya es la declaración.
- **D8. Sin migración** (regla de DEV). Lectura y escritura pasan directamente al formato nuevo. La
  configuración guardada hoy de providers, logins, IdPs, senders, webhooks y plugins **se pierde** al
  desplegar, y hay que reintroducirla o importarla. Se avisa antes de ese stream para copiarla a mano o
  sacarla con ☰ Kwirth export. Los routers ya usan el nombre del patrón; se mantiene si su formato
  interno coincide.
- **D9. Settings y Grants en el mismo diálogo, por pestañas.** *"¿Qué puede hacer la IA con este toolset
  aquí?"* se responde en una sola pantalla.

## Lo que hay que decir en voz alta

- **Toca a ocho managers a la vez.** Es el cambio con más superficie del PRD, y el riesgo es romper la
  configuración de una familia que hoy funciona. Por eso R6 (nada visible cambia salvo la validación) y
  tests por familia antes y después.
- **La validación puede rechazar lo que hoy se acepta.** Un formulario que hoy guarda un campo
  obligatorio vacío, o un `select` con un valor que ya no está en `options`, pasará a fallar. Es lo que se
  busca, pero se notará.
- **Se pierde la configuración guardada en dev** (D8).
- **Más Secrets en el namespace de Kwirth**: uno por extensión configurada. Es lo correcto, pero se verá
  en `kubectl get secrets`.
- **Toca el contrato `common-ai`**: `IAiToolsetInfo` y `IToolHost` ganan campos opcionales, sin romper.
  Hay que publicar `common-ai`, y los toolsets que quieran configuración suben su dependencia.
- **La configuración de un toolset no es un control de seguridad del core.** La aplica la tool, y un
  toolset mal escrito puede ignorarla. El control que no depende del autor sigue siendo la **concesión**.
- **Las capturas de la guía** del diálogo de AI toolsets quedan obsoletas.

## Criterios de aceptación

1. Las ocho familias leen y guardan a través del helper, y ninguna escribe ya configuración de extensión
   en un ConfigMap (comprobado por búsqueda en el código y con `kubectl get configmaps` tras configurar
   una extensión de cada tipo).
2. Cada familia funciona como hoy en su diálogo: crear, editar, borrar (las múltiples), ver los secretos
   con el ojo, export e import. Hay tests por familia.
3. Un valor inválido para el esquema se rechaza al guardar, con un error que nombra el campo, en todas las
   familias.
4. Desinstalar una extensión borra su Secret de configuración, en todas las familias.
5. Una configuración ilegible no tumba el arranque: se registra un aviso y se trata como vacía.
6. Un toolset sin `configSchema` se comporta como hoy, y su pestaña *Settings* aparece deshabilitada con
   el motivo.
7. Un toolset con esquema muestra el formulario con sus `default`. Guardar persiste en
   `kwirth-aitoolset-<id>-config`, y la siguiente ejecución de una tool recibe el valor nuevo en
   `host.config` sin reiniciar el back.
8. La configuración de un toolset se puede dar desde `kwirth-dev.json`, viaja en ☰ Kwirth export y se
   restaura con el import.
9. Tests unitarios del helper (lectura con defaults, validación de cada tipo de campo, `enabledWhen`,
   descarte de campos viejos, ilegible, borrado) y e2e no destructivos de los diálogos afectados, que
   restauran solo lo que leyeron.
10. La guía documenta la pestaña *Settings* de los toolsets, y la del autor de toolsets cómo declarar el
    esquema y leer `host.config`.

## Delegado al PLAN

1. **IdP**: hoy sus instancias tienen identidad propia (se referencian desde la configuración de login y
   SSO). Si se guardan como forma múltiple en `kwirth-idp-<connector>-config` o cada instancia en su
   propio Secret, lo decide el PLAN tras leer cómo se referencian (usuario, 2026-11-18).
