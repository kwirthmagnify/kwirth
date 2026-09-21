# Portabilidad de configuración — PLAN

> **ESTADO — EN CURSO.** Cuelga de [PRD.md](PRD.md), que manda sobre el qué y el porqué; aquí está el
> cómo y en qué orden. Abierto el 2026-09-21 sobre Kwirth 0.6.31.
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
  "formatVersion": 1,
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
      "config": { ... }          <- opaco para el core
    }
  ]
}
```

`formatVersion` desde el primer día: el día que el envoltorio cambie, un Kwirth viejo tiene que poder
decir "no sé leer esto" en vez de romperse a medias. `config` es **opaco**: el core lo transporta sin
mirarlo.

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

---

## Lo que cambió al construirlo

Tres cosas se descubrieron sobre la marcha y merecen quedar escritas, porque cambian el diseño del PRD:

**1. No toda la configuración de una extensión la guarda ella.** Un sender no puede listar sus propias
configuraciones de envío —las guarda `SenderManager`—, un conector de IdP no puede enumerar sus
instancias (la relación es 1 conector → N instancias, y la instancia apunta al conector, no al revés), y
ningún toolset conoce sus concesiones. Pedirles que lo exporten sería pedirles algo imposible.

La salida **no fue un tipo nuevo en el bundle**, que es lo primero que propuse: el core **fabrica el
`IExtension`** de cada entrada (`CoreManagedConfig.ts`) y `combine()` lo junta con lo que la extensión
exporte de sí misma. `ConfigBundleManager` sigue llamando a los dos mismos métodos sin saber quién hay
al otro lado, y el formato del fichero no cambia. Consecuencia: **casi toda extensión exporta algo desde
el primer día**, y `IExtension` queda para las que además guardan cosas por su cuenta.

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
- Importar desde una URL o una ruta, para usarlo desde un pipeline de despliegue.
- Ampliar `IExtension` con lo que no sea portabilidad (identidad, salud, diagnóstico).
- Captura del diálogo de **import** para la guía: la de export ya está.

### Hallazgos laterales, anotados y no tocados

- **`IdpManager.loadDevIdpConfigs()` existe y nadie lo llama** desde `index.ts` — solo se cargan los
  conectores. La sección `idpConfigs` de `kwirth-dev.json` no se siembra nunca. Es anterior a esto.
- **`POST /core/idps` devolvió 404** al intentar crear una instancia por API; no se investigó dónde se
  monta realmente ese router.

## Decisiones pendientes

- **¿Qué forma tiene el resumen de `importConfig`?** Es lo único del contenido que el core enseña.
  Propuesta para S1: `{ applied: number, skipped: number, warnings: string[] }` — suficiente para un
  informe honesto sin que el core interprete nada.
- **¿El bundle se firma o se versiona por su contenido?** Hoy no; se anota por si el fichero acaba
  viajando entre organizaciones.
