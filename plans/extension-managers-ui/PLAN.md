# Diálogos de gestión de extensiones — criterio de UI

Los **once** diálogos de gestión (plugins, providers, senders, themes, homepages, IdP, logins, webhooks,
packs, documentación) enseñan lo mismo con distinto contenido, así que tienen que **verse igual**. Cada vez
que uno se toca de forma aislada, aparece deriva: durante meses la mitad tenía una cosa y la otra mitad
otra, y solo se detectó revisándolos los diez a la vez.

Este documento fija el criterio. **Antes de dar por terminado un cambio en uno, comprobarlo en los once.**

## Status (2026-09-07) — CRITERIO APLICADO Y VERIFICADO

## Las reglas

### 1. Instalados y disponibles se ven igual

Las dos secciones muestran la misma información en el mismo sitio; lo único que cambia es la acción
(configurar/desinstalar frente a instalar) y lo que solo tiene sentido en una de ellas.

Seis diálogos (plugins, themes, homepages, logins, packs, docs) usan una **card compartida** entre ambas
secciones y por eso no derivan. Los otros cinco tienen el JSX duplicado: ahí es donde hay que mirar dos
veces.

### 2. Procedencia siempre: en las dos secciones **y en las dos vistas**

`MarketplaceSourceIcon` + `MarketplaceBadge` (`components/MarketplaceBadge.tsx`). En el catálogo es donde
más importa: con la precedencia por id, dos marketplaces pueden publicar el mismo `log` y el badge es lo
único que los distingue.

Son **veinte** sitios: 11 diálogos × instalados/disponibles × card/lista. Se corrigió en dos tandas porque
la primera solo miró las tarjetas: al pasar a lista, la procedencia desaparecía en las diez listas de
instalados. Al auditar, **contar 20**, no 10.

Una extensión de **dev**, de **fichero local** o descargada de una **URL suelta** no viene de ningún
marketplace: icono de consola y **ningún chip**. Sin esa excepción, el badge las etiquetaba como
"Kwirth" — anunciando como público un artefacto de pago cargado en dev.

### 3. La versión se elige en el catálogo, se muestra en lo instalado

En las tarjetas y filas de **disponibles**, un `Select` **siempre**, aunque solo haya una versión: si
aparece y desaparece según el catálogo, las tarjetas bailan. En **instalados** no hay nada que elegir, así
que va un `Chip`. En las cards compartidas eso es `versions ? <Select> : <Chip>`.

### 4. Todos los chips, compactos

`compactChip` (exportado por `MarketplaceBadge.tsx`) en **todos** los chips de una tarjeta o fila. Mezclar
tamaños en la misma fila se ve desordenado, y en la vista de lista canta el doble.

### 5. El conmutador card/lista vale para las dos secciones

Si una queda siempre en tarjetas, al pulsar "lista" media pantalla no cambia.

### 6. En la vista de lista, los chips se alinean a la derecha

Las listas son grids. Una columna `auto` toma el ancho de su contenido más ancho y lo de dentro se queda
pegado a la izquierda, así que un chip corto (`dev`) queda descolocado respecto a uno largo (`installed`).
Las celdas de chips llevan `justifySelf: 'end'`.

### 7. Ayuda también en el diálogo de configuración, no solo en el manager

`DialogTitleHelp` con la sección que explica **esa** configuración. El manager la llevaba desde el
principio, pero el diálogo donde de verdad se configura la extensión —que es donde surge la duda— no:
faltaba en los nueve (los `Configure` de senders, providers, plugins, logins, webhooks e IdP, más
Export/Import/Base configs de senders).

**Verificar el anchor contra la guía antes de enlazarlo.** Un botón de ayuda que abre una sección que no
existe es peor que no tenerlo. Los anchors salen de los `##` del `index.md` de cada familia.

Fuera de los managers, el mismo criterio alcanzó a *Configure metrics* y *Add / Edit cluster*. Siguen sin
ayuda —a propósito— los diálogos que no tienen sección propia que enlazar: About, Enter credentials,
Rename tab, PickList, Select cluster y el de Magnify.

### 8. Las acciones de una lista de configs van abajo, junto a `New`

`New` y `Clone` en una barra bajo la lista, cada uno a media anchura; el borrar, en su fila. `Clone` se
deshabilita mientras no haya una config abierta, **pero se sigue viendo**: si desapareciera, parecería que
la funcionalidad no existe — ver la regla de visibilidad ([[feedback_dialog_visibility]]).

Estaba resuelto así en senders desde antes; al añadirlo a webhooks se inventó otro patrón (un icono en
cada fila) sin mirar el existente, y costó tres correcciones. **Antes de añadir una acción a un manager,
buscar cómo está resuelta en los demás.**

### 9. El texto no se abrevia distinto según la vista

Mismo chip, mismo texto: `N configs` en tarjeta y en lista, no `N cfg` en una y `N configs` en la otra.

## Estado del genérico (2026-09-16) — CONSTRUIDO Y VALIDADO CON SU PRIMER CLIENTE

Ya existe, y funciona en producción de dev:

| Fichero | Qué es |
|---|---|
| `front/src/components/extensionManagerModel.ts` | El **descriptor**: `IExtensionManagerDescriptor` (endpoints, `toModel`, `canUninstall`, `extraChips`, `actions`, `renderConfigDialog`…), `IExtensionCardModel`, `IUninstallVerdict`, `EManagerSection` |
| `front/src/components/ExtensionCard.tsx` | Tarjeta y **celdas** de fila. `extensionRowCells` devuelve celdas sueltas, **no** un contenedor: así las columnas de la lista se alinean entre filas (regla 6) |
| `front/src/components/ExtensionManagerDialog.tsx` | El contenedor: dos secciones con filtro propio, conmutador card/lista, instalar desde catálogo/URL/fichero, procedencia, aviso de reinicio |
| `front/src/components/aiToolsetDescriptor.tsx` | **Primer cliente**: ~75 líneas, chip de `toolCount`, `helpSection` apuntando a la sección del manager en la guía |

Decisiones que conviene no volver a discutir:

- **El diálogo de configuración se renderiza como hermano, no anidado** — anidarlo heredaba el `aria-hidden`
  del padre y dejaba el formulario fuera del árbol accesible.
- **`helpSection` es opcional**: un tipo recién creado no tiene guía, y un botón de ayuda que abre una
  sección inexistente es peor que no tenerlo (regla 7). `aitoolset` nació sin ella y la recibió en el mismo
  CL9, al escribir su página — ese es el ciclo esperado, no una excepción.
- **La verificación de que el genérico no inventa nada**: `front/e2e/tests/aitoolsets-manager.spec.ts`
  (8 casos) fija las dos secciones con filtros independientes, la vista de lista, el veredicto de
  `canUninstall` **visible como motivo**, la ausencia de engranaje en un tipo sin configuración, y que
  **todos los chips miden lo mismo** — medido en el DOM, porque a ojo un chip con más contraste parece más
  grande aunque mida igual.

**Pendiente**: migrar los diez a medida, de uno en uno y comparando capturas.

## Pendiente: un diálogo genérico y cards estándar

**El criterio escrito no basta, y hay evidencia de sobra.** Once copias del mismo diálogo significan que
cada arreglo hay que aplicarlo once veces, y basta olvidar una para que reaparezca. Solo el 2026-09-09
salieron tres fallos del mismo molde:

- `DocsDialog.tsx` se llamaba distinto y por eso se libró de **tres** tandas seguidas — el Select de
  versión, la procedencia en las listas y los chips —. Las auditorías barren `*ManagerDialog.tsx`.
- Las tarjetas de disponibles de **senders** pintaban `displayName` sin alternativa y 40 de 105 entradas
  salían **en blanco**. Siete diálogos ya usaban `displayName || name`; ese no.
- Una auditoría propia dio los once en verde **con senders roto**, porque comprobaba si aparecían ciertos
  identificadores en el fichero, no qué pinta la tarjeta ni con qué datos.

Lo que hace falta:

- **Un diálogo genérico de gestión de extensiones**, parametrizado por tipo: las dos secciones, el
  conmutador card/lista, el filtro, el agrupado por id con su Select de versión, la instalación desde URL
  y desde fichero, y la procedencia. Lo específico de cada tipo —las acciones y los campos propios— entra
  por composición, no copiando el contenedor.
- **Componentes de card estandarizados**, uno por vista (tarjeta y fila), que reciban un modelo común:
  nombre, versión, descripción, procedencia, acciones. El nombre se resuelve **en un solo sitio**, y una
  card sin nombre deja de ser posible por construcción.

Mientras eso no exista, el criterio de este documento y las auditorías son un parche: reducen la deriva,
no la impiden. Y la auditoría tiene que mirar **lo que se renderiza contra datos reales**, no la presencia
de identificadores — es lo que dejó pasar lo de senders.

### Lo que se ve al leerlos enteros (2026-09-16)

Primer intento de esta auditoría: greps y contadores. **Salió mal, y era predecible** — es el error que
advierte este mismo documento. Dio, por ejemplo, que solo senders instala desde fichero, cuando lo hacen
**los diez** (el botón se llama *Browse…*, no *Upload*). Lo de abajo sale de leer los 10 ficheros enteros,
6.093 líneas.

**El esqueleto sí es común a los diez**, y es mucho: dos secciones (instalados / disponibles) con su filtro,
conmutador card/lista, catálogo agrupado por id con versiones ordenadas y `Select` de versión, instalación
desde catálogo / URL / fichero, `resolveSource`, `MarketplaceSourceIcon` + `MarketplaceBadge`, gradiente de
fondo por hash del nombre, `ViewToggle`, línea de error y botón CLOSE. Ahí no hay discusión.

**Pero debajo hay cuatro divergencias estructurales**, y ninguna es cosmética:

1. **La identidad no siempre es `id`.** En docs es el **par `(targetType, id)`** — el id es el de la
   extensión documentada y se repite entre tipos. Todo el agrupado, el `installingId` y el borrado usan
   `docsKey(targetType, id)`.
2. **No siempre hay una entidad.** IdP maneja **dos**: conectores (lo instalable) e *instancias* (lo
   configurado), en endpoints distintos (`/idp/connectors` y `/idp`). El chip de estado sale de la
   instancia, no del conector.
3. **"Instalado" no significa lo mismo.** Lo no desinstalable varía por tipo: `dev` en todos, `bundled`
   en plugins/docs/idp, `pack:` en casi todos, `core` en providers (que además se **filtran** de la lista),
   y en IdP un flag propio `installed`.
4. **Los endpoints no siguen un patrón.** Ocho cuelgan de `/core/<plural>`; IdP no (`/idp/...`).

**Y la configuración no es UNA cosa: son siete mecanismos distintos.**

| Tipo | Dónde vive su configuración |
|---|---|
| Plugin | JSON libre en `/core/plugins/:id/config`, editado como texto, con export/import |
| Provider | schema en `/core/providers/:id/schema` + valores en `/config` — **o** un `ConfigDialog` que trae la propia extensión, cargado por `<script>` en `window.__kwirth_providers__` |
| Sender | CRUD de configuraciones **con nombre** + *base config* compartida + export/import con selección |
| Webhook | el CRUD de senders, sin base config, más acuñado y **rotación de la URL con token** |
| IdP | una instancia por conector en `/idp`, schema-driven, con revelado de secretos vía `/idp/export` |
| Homepage | **`localStorage`** (`kwirth.homepage.config.<id>`) con defaults de `window.__kwirth_homepages__` |
| Login | schema del propio meta, en `/core/logins/:id/config` |
| Theme | no tiene: lo que hay es **asignación a plugins** en `/core/themes/assignments` |
| Docs, Pack | ninguna |

Eso cambia el diseño: **el genérico no puede absorber la configuración**. Lo que puede —y debe— es
estandarizar el **engranaje**, el **chip de N configuraciones** y **dónde** se monta el diálogo; el diálogo
en sí entra por composición y cada tipo sigue con el suyo. Unificar los siete mecanismos es otro trabajo,
posterior y opcional.

**Sobre la deriva visual** (flex contra grid, chips distintos, un `Typography` donde otro pone un `Chip`):
está medida y es real, pero **no hay que modelarla**. Desaparece sola en cuanto pinta el genérico. El
objetivo es que los once tengan la MISMA UI, así que lo único que hay que decidir es qué **funcionalidad**
expone cada tipo.

**La funcionalidad que varía, que es lo que el descriptor tiene que cubrir:**

| Capacidad | Quién la tiene |
|---|---|
| Configuración | los 7 de la tabla de arriba, cada uno con su mecanismo |
| Activar / desactivar una sola a la vez | homepage (`active`), theme (activo + asignación a plugins) |
| Habilitar / deshabilitar | IdP (`enabled`/`disabled`/`not configured`) |
| Dependencias que **bloquean** la instalación | plugin, provider, sender, webhook (`requires`/`uses`) |
| Abrir algo en otra pestaña | docs (la guía), login (su página de login), todos (el website) |
| Instalar **otras** extensiones al instalarse | pack (y disparar la carga de front de cada una) |
| Icono propio de la extensión | plugin (nombre del set curado **o** SVG saneado); el resto, icono fijo del tipo |
| No desinstalable | dev (todos), bundled (plugin/docs/idp), `pack:` (casi todos), core (provider), flag propio (idp) |

### Diseño (2026-09-16)

El descriptor de cada tipo, corregido con lo de arriba:

```ts
interface IExtensionManagerDescriptor<TInstalled, TEntry> {
    extensionType: EExtensionType
    title: string
    helpSection: string
    icon: ReactNode
    endpoints: { installed: string, install: string, upload: string, remove: (e: TInstalled) => string }
    key: (e: TInstalled | TEntry) => string        // NO 'id': docs es (targetType,id)
    toModel: (e: TInstalled | TEntry) => IExtensionCardModel
    canUninstall: (e: TInstalled) => { allowed: boolean, reason?: string }
    configCount?: (e: TInstalled) => number | undefined      // chip 'N configs'
    renderConfigDialog?: (e: TInstalled, onClose: () => void) => ReactNode   // engranaje
    extraChips?: (e: TInstalled | TEntry, section: ESection) => ReactNode[]
    actions?: (e: TInstalled | TEntry, section: ESection) => IExtensionAction[]
}
```

Las nueve reglas se cumplen **por construcción** dentro del genérico: procedencia en las cuatro
combinaciones, `Select` siempre en disponibles y `Chip` en instalados, `compactChip` en todos, conmutador
sobre las dos secciones, listas en grid con chips a la derecha, y el nombre resuelto en **un solo sitio**.

**Primer cliente: `aitoolset`**, que no tiene diálogo todavía: se estrena con riesgo cero. Los diez
existentes se migran después de uno en uno, comparando capturas — y cada migración es además la ocasión de
corregir la deriva de ese diálogo.

⚠️ **IdP y Pack son los candidatos a NO migrar**, o a migrar los últimos: IdP por las dos entidades y Pack
porque instala otras extensiones y dispara cargas de front por cada una. Forzarlos al molde puede salir más
caro que dejarlos aparte.
## Auditorías

El criterio se comprueba con scripts, no a ojo: contar usos de `MarketplaceSourceIcon` por fichero, chips
sin `compactChip`, ternarios de `viewMode` por sección, y presencia de versión en cada vista de lista. Un
número que se sale de la fila delata al diálogo que ha derivado. Fue lo que dio el alcance real de cada
síntoma: lo que se reportó como "en providers pasa X" era X en cuatro, nueve o los diez.

## Capturas de la guía

`front/e2e/tests/capture-managers.spec.ts` las regenera. **Desactiva temporalmente los marketplaces
privados** (snapshot + restauración literal): la guía es pública y el catálogo del entorno de desarrollo
trae las extensiones de pago. Un cambio de UI en estos diálogos invalida esas capturas — punto 4 del CL9.
