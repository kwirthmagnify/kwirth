# Portabilidad de configuración — PLAN

> **ESTADO — EN CURSO.** Cuelga de [PRD.md](PRD.md), que manda sobre el qué y el porqué; aquí está el
> cómo y en qué orden. Abierto el 2026-09-21 sobre Kwirth 0.6.31.
>
> **Los seis streams están hechos** (S6 el 2026-10-29) y el mecanismo está terminado y probado de punta
> a punta. Sigue abierto por dos cosas concretas, no por obra pendiente: las **capturas de la home**,
> que hay que retomar y que destaparon un posible problema de catálogo comercial en una guía pública, y
> la decisión sobre el **Import/Export propio de Excubitor**, que convive con el bundle con una regla
> contraria sobre los secretos. Las dos están al final, en *Hallazgos laterales* y *Decisiones
> pendientes*.
>
> **Alcance de esta tanda: el core, el front, y las extensiones open source que tenían configuración.**
> Creció sobre la marcha (ver *Lo que cambió al construirlo*): empezó siendo solo el core con `censor`
> de banco de pruebas.
>
> **Por qué censor y no otro.** Guarda **una lista de configuraciones con nombre y versión**, de las
> que unas están activas y otras no (`censor-configs`, en el almacén del canal), y además escribe en el
> **almacén común** (`STORAGE_KEY_LLMS`), que no es suyo sino compartido. Eso ejercita justo lo que hay
> que probar: un `exportConfig` que devuelve una colección, un `importConfig` que tiene que decidir qué
> hace con lo que ya hay, y la frontera entre lo propio y lo común. Y ya tiene su propio export suelto
> a `censor-configs.json` en `CensorImportExport.tsx`: lo que hoy se baja a mano es exactamente lo que
> pasará a entrar en el bundle, así que se puede comparar el antes y el después.

## Lo que ya existe y hay que respetar

No se parte de cero, y lo que hay condiciona el diseño:

| pieza | dónde | qué aporta |
|---|---|---|
| `exportConfig`/`importConfig` de IdP | `IdpManager` | el patrón, ya en producción |
| `GET /export` + `POST /import` | `IdpApi`, `SenderApi`, `WebhookApi` | rutas por tipo, que **no se tocan**: siguen valiendo para el export suelto de una extensión |
| Export con `Include credentials` | `SettingsKwirth.tsx` | la casilla y su semántica, ya conocida por el usuario |
| Export/Import a JSON por configuración | `ConfigListDialog.tsx` | el patrón visual de export selectivo |

Lo nuevo **no sustituye** a nada de eso: añade el bundle completo por encima.

## La decisión técnica espinosa: a quién se le pregunta

El core necesita una instancia viva para llamar a `exportConfig`, y no todas las familias la tienen:

| familia | qué guarda el core | ¿hay instancia? |
|---|---|---|
| `sender` | `instances: Map<string, ISender>` en `SenderManager` | **sí**, creada bajo demanda en `getInstance` |
| `webhook` | `instances: Map<string, IWebhook>` en `WebhookManager` | **sí**, igual |
| `plugin` (canal) | `runningInstance.channels: Map<channelId, IChannel>` | **solo** los `requiredChannels` que no sean `REMOTE` |
| `provider` | instancias creadas con `createProviderInstance` | solo los que alguien usa |
| `idp` | conectores registrados; las instancias son configuración, no objetos | el `IdpManager` responde por ellos |
| `aitoolset` | solo back, sin instancia por toolset | el `AiToolsetManager` responde por ellos |

**Decisión: se pregunta a la instancia que exista, y punto.** No se instancia nada temporalmente para
preguntar: un constructor de canal puede abrir informers, conexiones o temporizadores, y despertar medio
plugin para leerle una configuración es un efecto secundario desproporcionado — y difícil de deshacer.
Un hueco declarado es mejor que un efecto oculto.

⚠️ Consecuencia que hay que documentar en la guía: **exportar con todo en marcha da un bundle más
completo** que exportar un Kwirth recién arrancado y sin uso.

> **SUPERADO EN PARTE por `CoreManagedConfig`** (ver abajo): una extensión sin instancia ya no queda
> vacía, porque el core aporta lo que él guarda de ella. Lo que sigue sin poder preguntarse es lo que la
> extensión guarde por su cuenta.

## Formato del bundle

Un JSON, legible y editable a mano. Nombre de trabajo: `kwirth-config.json`.

```
{
  "kind": "kwirth-config-bundle",
  "formatVersion": 2,
  "meta": {
    "exportedAt": "2026-09-21T10:14:00.000Z",
    "kwirthVersion": "0.6.31",
    "source": "prod-cluster",
    "includesCredentials": false
  },
  "core": {
    "settings":  { ... },
    "sharedAi":  { ... }
  },
  "extensions": [
    {
      "type": "plugin",
      "id": "excubitor",
      "version": "0.9.2",
      "marketplace": "IRIA private",
      "coreConfig": { ... },     <- lo que guarda el CORE sobre ella
      "config":     { ... }      <- lo que guarda ELLA; los dos opacos
    }
  ]
}
```

`formatVersion` desde el primer día: el día que el envoltorio cambie, un Kwirth viejo tiene que poder
decir "no sé leer esto" en vez de romperse a medias. Los dos `config` son **opacos**: el core los
transporta sin mirarlos.

🔴 **El formato 2 (2026-10-29) separó las dos partes**, y no es cosmética. En el formato 1 ambas viajaban
dentro de `config` y **en dos formas distintas** según si la extensión tenía algo propio: `{installConfig}`
cuando no, y `{core, own}` cuando sí. Consecuencias, las tres reales:

- La forma de una entrada dependía de **quién implementara qué**, así que al añadir `exportConfig` a una
  extensión cambiaba el formato de su entrada sin que nada lo dijera.
- Un fichero exportado **antes** de que las extensiones adoptaran el contrato se leía después como si su
  única parte fuera de la extensión, y **la configuración de instalación se perdía en silencio**.
- Y nadie leyendo el fichero podía saber **cuál de las dos partes faltaba**: una entrada con solo la del
  core se ve igual venga de una extensión que no guarda nada propio o de una a la que no se pudo
  preguntar.

La conversión del formato 1 vive en `normalizeEntry` (`back/src/tools/ConfigBundleManager.ts`) y decide
**por la versión declarada en el fichero, nunca por la forma del contenido**: un v2 cuya única parte es
la propia es indistinguible de un v1 plano, y adivinar intercambiaría las dos en silencio.

## Streams

Cada uno cierra con su CL9. Ninguno depende de que ninguna extensión se adapte.

---

### S1 — El contrato y el export  ✅ HECHO

**Entrega:** se puede descargar el bundle por API, con lo que aporta el core.

- `common-back/src/IExtension.ts`: la interfaz, con los dos métodos **opcionales**, y los tipos
  `IExportOptions`, `IImportResult`. Los contratos existentes (`IChannel`, `IProvider`, `ISender`,
  `IWebhook`, `IIdpConnector`) pasan a extenderla. **Nada se rompe: todo es opcional.**
- `common/src`: los tipos del bundle (`IConfigBundle`, `IBundleEntry`), que necesitan front y back.
- `back/src/tools/ConfigBundleManager.ts`: reúne lo del core y recorre las familias preguntando a quien
  tenga instancia y método. Es el único sitio que sabe de las once familias.
- `back/src/api/ConfigBundleApi.ts`:
  - `GET /config-bundle/exportable` — qué hay para exportar y en qué estado está cada entrada
    (`available`, `not-supported`, `not-instantiated`). Es lo que pinta el diálogo.
  - `GET /config-bundle/export?include=…&credentials=…` — el bundle.
- Tests de `ConfigBundleManager` con managers falsos: con método, sin método, sin instancia, con y sin
  credenciales.
- **`censor` implementa el contrato**: `exportConfig` lee sus `ICensorInstanceConfig[]` del almacén del
  canal (`censor-configs`); `importConfig` valida y hace upsert por nombre+versión. **No** exporta los
  LLMs ni los proveedores de IA: viven en el almacén común, que es de todos, y los aporta el core.

**Criterio:** `GET /config-bundle/export` devuelve un JSON válido con los ajustes globales **y las
configuraciones de censor** dentro, y sin una sola credencial cuando no se piden.

✅ **Resuelto el bloqueo de publicación:** los tipos nuevos no existían para `common-back`, `back` ni
`front` hasta publicar. Cascada hecha: `kwirth-common` **0.5.52** y `kwirth-common-back` **0.5.47**.

---

### S2 — El import  ✅ HECHO

**Entrega:** un bundle de un Kwirth se aplica en otro.

- `POST /config-bundle/preview` — lee el bundle y devuelve, por entrada, qué pasaría: se aplica, la
  extensión no está instalada, está pero no implementa `importConfig`, no está instanciada, o la
  versión difiere. **No toca nada.**
- `POST /config-bundle/import` — aplica solo las entradas que se le indiquen y devuelve el informe con
  lo que cada extensión haya respondido.
- Las cuatro reglas del PRD, literales: buscar, ignorar con aviso si no está, ignorar con aviso si no
  implementa, y entregar. Un fallo de una entrada **no detiene** las demás.
- Validación del envoltorio (`kind`, `formatVersion`) antes de nada: el fichero es editable a mano y
  puede llegar cualquier cosa.
- Tests: bundle bueno, bundle de versión futura, entrada de extensión ausente, extensión que revienta
  al importar, bundle con basura.

**Criterio:** exportar e importar sobre el mismo Kwirth no cambia nada, y una entrada rota no impide que
entren las demás.

---

### S3 — El front  ✅ HECHO

**Entrega:** los dos diálogos, con la vista previa.

- Diálogo de export: lista agrupada, todo marcado, casilla **"Include credentials" desmarcada por
  defecto**, y las entradas no disponibles mostradas pero no marcables, con su motivo.
- Diálogo de import: se sube el fichero, se llama a `preview`, se muestra qué haría cada línea, se
  marca, se importa, y se enseña el informe final.
- Dónde vive: `SettingsKwirth`, que es donde ya está el export de ajustes globales.
- e2e que recorra export → import en el mismo Kwirth y compruebe que no cambia nada.

**Criterio:** lo que dice la vista previa es lo que ocurre.

---

### S4 — Documentación  ✅ HECHO

- Página propia en la docu 0.6.31: qué es, qué **no** es, y el porqué del reparto de responsabilidades.
- Sección para quien escribe extensiones: cómo implementar `IExtension`, con el ejemplo de las dos
  tablas de Agora —qué es configuración y qué son datos— y la obligación de ser idempotente.
- Capturas de los dos diálogos.

### S5 — La IA, puerta única  ✅ HECHO (2026-10-28)

Los diálogos de **AI Providers** y **AI Models** tenían su propio Import/Export, de antes del bundle.
Eran una **segunda puerta al mismo configmap y al mismo secret**, y ya habían divergido: el export local
escribía una copia reducida del provider a mano (`name`, `type`, `key`, `endpoint`), así que los precios
y los límites añadidos el 2026-10-26 dejaron de viajar sin que nadie se enterara; y el import sustituía
la lista entera desde un fichero sin validar, con un `catch {}` que no decía nada cuando el fichero no
era uno. Fuera los dos, en `kwirth-common-ai@0.5.77`, con un comentario en cabecera para que no vuelvan.

Quitarlos obligó a cerrar antes lo que el bundle no cumplía **de su propia regla** (`ConfigBundle.ts`:
un secreto viaja VACÍO, nunca omitido), porque sin eso el reemplazo sí perdía cosas:

- `readSharedAi` **omitía los providers enteros** cuando no se pedían credenciales. No ocultaba las
  keys: perdía nombres, tipos, endpoints, precios por defecto y límites — y en el destino
  `writeSharedAi` ni tocaba el secret, porque no llegaba nada.
- y entregaba los **modelos en crudo** del configmap, así que un modelo con key propia la sacaba en
  claro en un fichero cuyo autor había dejado la casilla sin marcar a propósito.

La redacción sale ahora a `back/src/tools/SharedAiPortability.ts` (`redactSharedAi`), función pura y por
tanto testeable: la implementación vivía inline en `index.ts` y el harness solo tenía un doble. **9 tests
nuevos** (841 en el core) y **4 casos e2e** en `kwirth-portability.spec.ts`.

Con credenciales marcadas las keys viajan y no hay nada que defender: es exactamente lo que se ha pedido.

### S6 — Dos fuentes, dos campos  ✅ HECHO (2026-10-29)

Salió de implementar `exportConfig` en los siete artefactos de pago y descubrir que **el e2e que los
vigilaba estaba en verde sin comprobar nada**: `combine()` metía lo de la extensión dentro de `own`, el
spec leía `entry.config.models`, y como todas sus aserciones eran `toBeUndefined()` sobre un objeto que
no era el que llevaba los datos, pasaban con la configuración vacía. Iter y sugarless llevaban semanas
diciendo que sí. Al mirar el campo correcto saltó además que el `dist` de iter era del **26 de octubre**
y no implementaba `exportConfig` siquiera.

Tres arreglos, en `kwirth-common@0.5.77`:

1. **`coreConfig` y `config`, campos hermanos** (formato de bundle **2**). `combine()` eliminado, cada
   interlocutor preguntado por separado y dentro de su propio `try` — si revienta la extensión, lo del
   core sale igual, que antes se perdían los dos. `normalizeEntry` lee el formato 1 decidiendo por la
   versión del fichero. El porqué, en *Formato del bundle*.
2. **Estado `PARTIAL`.** Sin instancia viva el core devolvía igualmente su interlocutor: la extensión
   entraba en el fichero, el diálogo la pintaba disponible y dentro iba solo la configuración de
   instalación — en excubitor, sus ocho áreas. Se exporta igual, pero se dice, en ámbar, en los dos
   diálogos. ⚠️ Solo se marca a quien **puede** tener instancia (canales y providers): un IdP o un
   toolset guardan su configuración en el core por diseño, y pintarlos en ámbar para siempre enseñaría
   a ignorar el aviso que sí importa.
3. **Los textos del diálogo dejaron de mentir.** Decían *"ábrelo y vuelve a exportar"*, y abrir la
   pestaña no hace nada: los canales se instancian **al arrancar el back** (`requiredChannels` incluye
   todo plugin instalado). Lo que queda sin instancia es un canal hospedado por otro Kwirth y un
   provider que nadie requiere, y ninguno se arregla desde ahí.

**+14 tests** en `configBundle` (850 en el core) y **−5** de `combine`, retirados porque esa función ya
no existe. En e2e, **+2 casos** en `kwirth-portability.spec.ts`.

🔴 **Y el e2e se repartió.** El spec transversal que probaba los siete juntos vivía en `iria/`, fuera
del ciclo de todos: portabilidad es del **core y es OSS**, así que el mecanismo —formato, dos campos,
aviso de lo parcial— se fija en `front/e2e/tests/kwirth-portability.spec.ts`, en el repo público, y lo
que mete cada artefacto en su parte se comprueba en **el repo de cada artefacto**, para que caiga en SU
cierre. `iria/e2e/` borrada.

🔴 **El spec del core hacía login en cada test**: diez arranques de la aplicación, 15,7 minutos por
corrida, y la lentitud *era* el fallo — la mitad de los rojos eran `openMenu` agotando su timeout en
tests que no llegaban a mirar lo que miden. Un login y dos exports en el `beforeAll`: **1,2 minutos** y
ni un reintento. Queda apuntado en *Fuera de esta tanda* que hay ocho specs más del core con el mismo
vicio.

---

## Lo que cambió al construirlo

Tres cosas se descubrieron sobre la marcha y merecen quedar escritas, porque cambian el diseño del PRD:

**1. No toda la configuración de una extensión la guarda ella.** Un sender no puede listar sus propias
configuraciones de envío —las guarda `SenderManager`—, un conector de IdP no puede enumerar sus
instancias (la relación es 1 conector → N instancias, y la instancia apunta al conector, no al revés), y
ningún toolset conoce sus concesiones. Pedirles que lo exporten sería pedirles algo imposible.

La salida **no fue un tipo nuevo en el bundle**, que es lo primero que propuse: el core **fabrica el
`IExtension`** de cada entrada (`CoreManagedConfig.ts`). `ConfigBundleManager` llama a los dos mismos
métodos sin saber quién hay al otro lado. Consecuencia: **casi toda extensión exporta algo desde el
primer día**, y `IExtension` queda para las que además guardan cosas por su cuenta.

> 🔴 **Corregido el 2026-10-29.** Las dos fuentes se juntaban en un solo interlocutor con un `combine()`,
> y eso resultó ser el error: fusionarlas hacía que la forma de una entrada dependiera de quién
> implementara qué, y perdía la configuración de instalación al leer ficheros anteriores al contrato
> (ver *Formato del bundle*). `combine()` **ya no existe**: el core pregunta a los dos por separado y
> cada respuesta va a su campo, `coreConfig` y `config`. La idea de fondo —el core fabrica un
> interlocutor y el manager no sabe quién responde— se mantiene intacta; lo que se deshizo es mezclar
> sus respuestas.

**2. Los secretos se vacían por esquema.** Las configuraciones de un sender o un webhook pueden llevar
una contraseña dentro, y el core no sabe cuál de sus campos lo es. Se lo dice la extensión en
`getConfigSchema()`, con `type: 'password'`. Y si una extensión **no publica esquema**, su configuración
no sale del fichero: entre omitirla o escribir una contraseña en claro en algo que acaba en la carpeta
de descargas de alguien, se omite y se avisa.

**3. La UI va por bloques.** Una lista plana era ilegible pasada la docena de entradas: un sender, un
IdP y un plugin no se eligen con el mismo criterio. Un bloque General y uno por tipo, cada uno con su
casilla. Y al capturarla apareció un fallo que leyendo el código no se veía: **la casilla de credenciales
quedaba bajo el pliegue**, con dos contenedores scrollables anidados. Ahora solo scrollea la lista.

## Fuera de esta tanda

Anotado para que no se pierda, **sin compromiso de fecha**:

- **Excubitor y Agora**, que son las que demuestran que el contrato aguanta un back con base de datos
  propia — y las únicas cuyo `exportConfig` tiene que separar configuración de datos dentro del mismo
  Postgres. Es la prueba que falta.
- El resto de artefactos de pago (iter, montag, sugarless, situs, ianus, modus).
- **Temas, homepages y logins**: su configuración la guarda el core (`kwirth-theme-assignments`, la
  config de un login) y hoy **no entra en el bundle**. Encajan en `CoreManagedConfig` igual que los
  demás; se dejaron fuera por acotar.
- **Granularidad de `core/sharedAi`**: hoy es **una unidad**, así que no se puede llevar *solo* los
  providers o *solo* los modelos. Partirlo en dos claves (`core/aiProviders`, `core/aiLlms`) toca
  `ConfigBundle.ts` (la clave y `IConfigBundleCore`), `PortabilityShared.tsx`, los dos diálogos y
  `ConfigBundleManager`. Anotado al quitar el Import/Export de los diálogos (S5); nadie lo ha pedido.
- Importar desde una URL o una ruta, para usarlo desde un pipeline de despliegue.
- Ampliar `IExtension` con lo que no sea portabilidad (identidad, salud, diagnóstico).
- Captura del diálogo de **import** para la guía: la de export ya está.
- **Distinguir el motivo de un `PARTIAL`.** Hoy el aviso es uno solo —"no está arrancada aquí"— y los
  dos motivos no se arreglan igual: un canal **REMOTE** se hospeda en otro Kwirth y hay que exportarlo
  desde allí (accionable), mientras que un provider que nadie requiere simplemente no está. El core lo
  sabe: `ri.remoteChannels` los tiene listados y `buildExtensionRefs` ya recibe `channels` del mismo
  sitio. Cuesta pasar un campo más y partir el texto en dos.
- **Ocho specs del core hacen varios `login()` sin compartir página** (`kwirth-log-settings` cinco,
  `broken-extension` tres, y `help-popup`, `kwirth-settings`, `extension-catalogs`,
  `previous-log-sender`, `sender-help` y dos de captura, dos cada uno). Son **76 logins en 57 specs**:
  a ~40 s cada uno, del orden de 50 minutos de la suite completa gastados solo en arrancar la
  aplicación. El arreglo es el mismo `beforeAll` que bajó `kwirth-portability` de 15,7 min a 1,2.
  ⚠️ **`help-popup` es uno de ellos**, y es justo el que el histórico de métricas tiene anotado desde
  hace semanas como flaky por *"contaminación entre tests"*: puede que no sea contaminación de estado
  sino esto mismo. Merece comprobarse al arreglarlo.

### Hallazgos laterales, anotados y no tocados

- **`IdpManager.loadDevIdpConfigs()` existe y nadie lo llama** desde `index.ts` — solo se cargan los
  conectores. La sección `idpConfigs` de `kwirth-dev.json` no se siembra nunca. Es anterior a esto.
- **`POST /core/idps` devolvió 404** al intentar crear una instancia por API; no se investigó dónde se
  monta realmente ese router.
- 🔴 **Excubitor tiene su propio Import/Export, con la regla CONTRARIA.** Su diálogo
  (`⋮` → Import / Export) dice, y así está documentado en su guía, que *una credencial importada sin
  contraseña conserva la que ya había*. El bundle hace lo opuesto a propósito: **se persiste lo que
  llega**, blanco incluido, porque con el merge una credencial no podría borrarse nunca. Son **dos
  puertas al mismo almacén con criterios opuestos** — exactamente el problema que S5 resolvió con los
  diálogos de IA. No son redundantes del todo (el de Excubitor lleva además lo *per-cluster* y permite
  elegir reglas sueltas), así que no basta con quitar uno. Documentada la diferencia en su guía
  (`08-import-export.md`), **decisión pendiente**.
- **Las capturas de la home quedaron por retomar** tras pintar los iconos de channel solo con el panel
  desplegado: `home.png` y `ui-home-cluster-details.png`. Ninguna tiene spec de captura, se hicieron a
  mano. ⚠️ Y al ir a automatizarlo apareció algo que no es de este stream: el panel desplegado **lista
  los channels instalados por su nombre**, y en el entorno de desarrollo están los de pago.
  `capture-managers` desactiva los marketplaces privados justo para no publicar el catálogo comercial
  en una guía pública; esa captura no pasa por nada equivalente, así que la imagen actual podría tener
  ya el problema.

## Decisiones pendientes

- ~~**¿Qué forma tiene el resumen de `importConfig`?**~~ **RESUELTA en S1**:
  `{ applied: number, skipped: number, warnings: string[] }`, suficiente para un informe honesto sin
  que el core interprete nada. Desde S6 los dos interlocutores de una entrada se suman en un único
  resumen, avisos incluidos.
- 🔴 **¿Se quita el Import/Export propio de Excubitor?** Son dos puertas al mismo almacén con criterios
  opuestos sobre los secretos (ver *Hallazgos laterales*). No se pueden fusionar sin más: el de
  Excubitor lleva además lo *per-cluster* y deja elegir reglas y políticas sueltas, que el bundle no
  hace. Las opciones son alinear la semántica de secretos, dejarlo como está documentando la diferencia
  —que es lo que hay hoy— o ampliar el bundle para absorberlo.
- **¿El bundle se firma o se versiona por su contenido?** Hoy no; se anota por si el fichero acaba
  viajando entre organizaciones.
