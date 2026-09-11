# Sugarless — glucosa en tiempo real · PRD

> Documento de definición de producto (previo a diseño técnico y código).
> Estado: **borrador 2026-09-11**, con las decisiones 1–6 cerradas por el usuario en la conversación
> de arranque. Pendiente de su validación.
> Artefactos **libres** (públicos, npm + manifest público, scope `@kwirthmagnify`).
> Origen: hace falta una demo que pruebe que **Kwirth no es una herramienta específica de Kubernetes**.

---

## 1. Resumen ejecutivo

Sugarless lee las mediciones de glucosa del sensor Abbott FreeStyle Libre de un usuario, a través de
LibreLinkUp, y las pinta en un gráfico que se actualiza en vivo dentro de Kwirth.

```
  Abbott LibreLinkUp          provider sugarless              plugin sugarless
  (API en internet)     →     login + polling + buffer   →    un gráfico
                              credenciales y tope de           y nada más
                              muestras configurables
```

El valor del artefacto **no es médico, es argumental**: ni un pod, ni un namespace, ni un contenedor
aparecen en ningún punto del flujo. Si Sugarless funciona, la tesis "Kwirth es una plataforma de
observabilidad genérica, y Kubernetes es solo uno de sus orígenes" deja de ser una afirmación de
marketing y pasa a ser algo que se enseña en treinta segundos.

De ahí se deriva el criterio que ordena todas las decisiones de este documento: **simplicidad por
encima de completitud**. Cualquier funcionalidad que no se vea en la demo es alcance de otro día.

### Criterio de éxito

1. Un usuario con una cuenta de LibreLinkUp introduce sus credenciales en la configuración del
   provider, abre la pestaña del canal y ve su curva de glucosa.
2. La demo se puede dar sin pronunciar la palabra "Kubernetes".
3. El código de ambos artefactos es lo bastante pequeño como para leerlo en voz alta en una charla.

---

## 2. Alcance

### Dentro (v1)

- Provider propio que se autentica en LibreLinkUp, hace polling y mantiene un histórico **en memoria**
  con un tope de muestras configurable.
- Configuración del provider: credenciales, región, intervalo y tope de muestras. Persistida, con las
  credenciales en un Secret.
- Plugin que se suscribe al provider y **solo** pinta el gráfico.
- Una única cuenta configurada.

### Fuera (v1), y por qué

| Fuera | Por qué |
|---|---|
| Persistencia del histórico (Postgres) | Decisión 3: en v1 el histórico vive en memoria del provider. Un reinicio del core lo borra, y eso es aceptable para una demo. |
| Autodescubrimiento de la región | Decisión 6: la región se configura a mano. Es estable una vez conocida, y el descubrimiento exige relogin contra otro host (ver §5.3). |
| Varias cuentas / varios pacientes | Una cuenta cubre la demo. Añadir N configuraciones nombradas es el patrón de `http-pull-push` y se puede hacer después sin romper nada. |
| Alertas de hipo/hiperglucemia | Kwirth ya tiene el plugin `alert` y los senders. Sugarless no debe duplicarlo. |
| Cualquier pretensión clínica | No es un dispositivo médico. Ver §8. |

---

## 3. Por qué un provider propio y no `http-pull-push`

Se evaluó a fondo (lectura completa de los 806 loc de `providers/http-pull-push/src`) y **no puede
hacerlo**. El provider genérico hace **una petición sin estado por ciclo**; LibreLinkUp exige una
cadena con estado:

1. `POST /llu/auth/login` con `{email, password}` → devuelve `data.authTicket.token`.
2. `GET /llu/connections` con `Authorization: Bearer <ese token>`.
3. Ante un `401`, rehacer el paso 1 y repetir.

Los huecos concretos de `http-pull-push`:

- No tiene paso de login. `EAuthType.BEARER` exige un token **estático** tecleado a mano
  (`Validation.ts` obliga a `auth.token`), que caduca.
- No sabe extraer un valor de una respuesta para usarlo en la siguiente. El `fingerprint` del `Poller`
  trata `auth.token` como dato inmutable de la configuración.
- No reautentica ante un `401`. `fetchWithRetries` reintenta la petición **idéntica**, y un `401` no es
  ni siquiera un error para él: es un `status` válido que se emite como dato. Token caducado = `401`
  para siempre.
- Y el hallazgo que lo cierra del todo: la lectura exige una cabecera `Account-Id` cuyo valor es el
  **SHA-256 del id de usuario** devuelto por el login (§5.3). No es un dato que se copie de una
  respuesta a otra: **se computa**. Eso lo sitúa fuera del alcance no solo de `http-pull-push`, sino
  también del contrato declarativo de plantillas (`session.steps`) que se propuso y se descartó: una
  plantilla sabe mover un valor, no hashearlo.

Se propuso enriquecerlo con un contrato declarativo genérico (`session.steps`: cadena de peticiones
previas con extracción de variables y `reauthOnStatus`), que habría cubierto también OAuth2
`client_credentials`, CSRF+login y sesiones por cookie. **El usuario lo descartó**: el flujo es
demasiado específico y mañana aparece otro consumidor con otra peculiaridad.

La frontera que queda es defendible y conviene escribirla: **`http-pull-push` hace pull declarativo;
lo que necesite computar o negociar algo por petición es otro provider.** Eso mismo aplicaría a una API
con firma por petición (AWS SigV4) o a OAuth2 interactivo.

**`http-pull-push` no se toca.**

---

## 4. Arquitectura

Dos artefactos, ambos públicos:

| Artefacto | Responsabilidad |
|---|---|
| `providers/sugarless/` | Todo: configuración, credenciales, login, polling, dedupe, histórico. |
| `plugins/sugarless/` | Pintar el gráfico. Sin configuración propia. |

El reparto no es arbitrario: el provider es el dueño del dato porque es quien tiene la sesión y el
temporizador, y porque así el histórico sobrevive a que el usuario cierre y abra la pestaña.

**Referencia de scaffolding**: `providers/http-pull-push` para el provider (back + common + front, con
`configRouter` y `ConfigStore` propios) y `plugins/provider-debug` para el plugin (canal cluster-scoped
que se suscribe a un provider). **No** `providers/tick` ni `providers/sample`: son de un fichero y sin
configuración.

---

## 5. El provider

### 5.1 Configuración

| Campo | Tipo | Destino | Defecto | Notas |
|---|---|---|---|---|
| `email` | texto | **Secret** | — | Credencial de LibreLinkUp. Al Secret por ser PII, no solo por ser credencial. |
| `password` | secreto | **Secret** | — | Campo enmascarado con ojo de visibilidad. |
| `region` | texto | ConfigMap | vacío | Vacío = `https://api.libreview.io`. Con valor = `https://api-<region>.libreview.io`. |
| `intervalSeconds` | número | ConfigMap | `60` | Mínimo validado (ver §8, cortesía con la API). |
| `maxSamples` | número | ConfigMap | `240` | Tope del histórico en memoria. 240 = 4 h a una muestra por minuto. |
| `clientVersion` | texto | ConfigMap | `4.16.0` | Versión de cliente que se le declara a Abbott. **Configurable porque Abbott sube el mínimo con el tiempo** y eso rompe el provider desde fuera (ver §5.3). |

### 5.2 Persistencia — y la trampa que la decide

**Decisión 4: el provider usa su propio `configRouter` + `ConfigStore`, no el schema genérico del core.**

Es tentador declarar `getConfigSchema()` y dejar que el core pinte el formulario solo: el contrato
`IConfigFieldDef` soporta `type: 'password'` con ojo de visibilidad, y saldría gratis un front entero.
**No sirve aquí**: `ProviderManager.saveConfig()` (`back/src/tools/ProviderManager.ts:376`) escribe
*todo* en un ConfigMap (`kwirth-provider-<id>-config`), **sin partir secretos**. La contraseña de la
cuenta Abbott del usuario quedaría en claro, legible con `kubectl get cm -o yaml`.

Por eso `http-pull-push` se fabricó su propio `ConfigStore`, y Sugarless copia ese patrón:

- `kwirth-store-provider-sugarless-config` → **ConfigMap**: `region`, `intervalSeconds`, `maxSamples`.
- `kwirth-store-provider-sugarless-creds` → **Secret**: `email`, `password`.

Endpoints propios, montados por el core en `/core/providerconfig/sugarless`, siempre detrás de
validación de accessKey:

- `GET /config` — configuración actual **completa, contraseña incluida**. El diálogo la pinta
  enmascarada con un ojo para revelarla.
- `PUT /config` — la reemplaza (validada, persistida y aplicada en caliente). **Se persiste lo que
  llega**, sin merges.

> **Corregido el 2026-09-11 tras un error.** La primera implementación devolvía un `hasPassword` en
> lugar del valor y hacía un merge "campo vacío = no la cambies" en el PUT. Eso **está prohibido en
> este proyecto** y está escrito en `.claude/CLAUDE.md`: en Kwirth los secretos se manejan como
> cualquier otro dato — viajan al front y se ocultan **solo en la UI**, con `type='password'` y un
> toggle de ojo. Lo que hace que un campo sea secreto es únicamente **dónde se persiste** (Secret en
> vez de ConfigMap), no que se esconda del navegador. Referencia viva: `http-pull-push`, cuyo
> `GET /configs` devuelve las conexiones con las credenciales recompuestas del Secret.
- `POST /test` — prueba las credenciales **desde el back** y devuelve si el login funciona y cuántas
  conexiones ve. Se prueba en el back porque es el back quien tiene la red y la identidad con las que
  se hará el pull de verdad; probar desde el navegador no demostraría nada.

> Nota de contexto: `configure()` está marcado como deprecado en `IProvider`, pero el core **sí lo
> sigue llamando** (`back/src/index.ts:1321` y `:1679`) con lo que lee de ese ConfigMap. El deprecado
> describe la intención, no el comportamiento actual. Sugarless no lo usa.

### 5.3 Flujo de autenticación

Tomado de `plugins/sugarless/docs/samples/libre-logger.js`, que es la referencia funcional validada por
el usuario.

Cabeceras en toda petición: `Content-Type: application/json`, `product: llu.android`,
`version: <clientVersion>`.

```
login()          POST {base}/llu/auth/login   body {email, password}
                 → token     = data.authTicket.token
                 → accountId = sha256_hex(data.user.id)      <- se CALCULA, no se copia
                 → region    = claim 'region' del token

read()           GET  {base}/llu/connections  Authorization: Bearer {token}
                                              Account-Id: {accountId}
                 → data[0].glucoseMeasurement.{Timestamp, Value, TrendArrow}
                 → 401 ⇒ login() y reintentar UNA vez
                 → status 920 ⇒ versión de cliente caducada (ver abajo)
                 → 400 RequiredHeaderMissing ⇒ falta Account-Id
```

**La cabecera `Account-Id` es obligatoria** en las versiones recientes de la API, y su valor es el
**SHA-256 en hexadecimal del `data.user.id`** que devuelve el login. Sin ella, `/llu/connections`
responde `HTTP 400 {"message":"RequiredHeaderMissing"}`. Verificado el 2026-09-11.

`{base}` se compone de `region` (§5.1) y no cambia en caliente.

**La versión de cliente caduca, y es un fallo que llega desde fuera.** Verificado en la primera prueba
real (2026-09-11): con `version: 4.12.0`, `/llu/auth/login` responde `status: 0` y entrega el token
con normalidad, pero `/llu/connections` responde **`HTTP 403` con
`{"status":920,"data":{"minimumVersion":"4.16.0"}}`**. Es decir: el login no valida la versión y la
lectura sí, así que el síntoma es *"autentico bien pero no leo nada"*.

Dos consecuencias de diseño:

1. `clientVersion` es **configurable** (§5.1). El día que Abbott suba el mínimo, el provider se
   arregla desde la UI y no con un release.
2. El `status 920` se traduce a un error explícito que **incluye el mínimo que pide la API**:
   `"client version too old: Abbott requires at least <minimumVersion>; set it in the provider
   configuration"`. Sin eso, este fallo se presenta como un gráfico vacío sin explicación.

**El redirect de región no se implementa.** Abbott lo señala con `data.redirect` + `data.region` en el
**cuerpo de un 200** (no con un 3xx) y obliga a repetir el login contra el host regional. Como la
región se configura a mano (decisión 6), basta con **detectarlo y reportarlo**: si la respuesta del
login trae `redirect`, el provider registra un error explícito del tipo
`"wrong region: the API says this account lives in '<region>'; set it in the provider configuration"`.
Eso convierte el único fallo de configuración probable en un mensaje que se arregla solo.

> **Hallazgo de la prueba real: la región viaja dentro del token.** El JWT que devuelve el login lleva
> un claim `region` (en la prueba, `"eu"`), junto con `units` y el rol. Se lee decodificando en base64
> el segundo segmento del token — **sin verificar la firma, que no nos corresponde**: no somos ni el
> emisor ni el destinatario, solo leemos un dato de enrutado.
>
> Eso hace que el autodescubrimiento de región sea **gratis**, sin implementar el redirect: se loguea
> contra el host global, se lee el claim y se usa el host regional para leer. Deja la decisión 6 en
> pie pero le quita la razón de ser. **Propuesta**: `region` pasa a ser un campo *opcional* de
> override; vacío = derivar del token. Pendiente de que el usuario lo valide.

### 5.4 Polling e histórico

**Decisión 3: histórico en memoria, con tope `maxSamples`.** Un ring buffer: al llegar la muestra
`maxSamples + 1` se descarta la más antigua.

- **Dedupe por `Timestamp`.** El sensor solo produce un valor nuevo cada ~15 minutos, pero se le
  pregunta cada minuto para no llegar tarde. Una lectura con el mismo `Timestamp` que la anterior
  **no se añade**. Esto es exactamente lo que hace el `lastTimestamp` del sample.
- **El eje X son los `Timestamp` del sensor, no las horas de polling.** Mezclarlos dibujaría una curva
  falsa.
- **Se poletea mientras el provider esté arrancado y configurado**, no solo mientras haya pestañas
  abiertas. Es lo contrario de la política *lazy* de `http-pull-push`, y es deliberado: el sentido de
  tener histórico es que al abrir la pestaña ya haya curva. Sin credenciales configuradas **no se
  hace ni una petición**.
- Si un ciclo sigue en vuelo cuando toca el siguiente, se salta: el intervalo marca el ritmo, no la
  latencia del endpoint.

### 5.5 Contrato de suscripción y de eventos

**Decisión 5: un subscriber por instancia, con snapshot al suscribirse.** Este es el punto no obvio
del diseño, y merece explicación.

`startChannel()` se llama **una vez por canal** (`back/src/index.ts:1565`), no por pestaña. Si el canal
se suscribiera ahí (como hace `plugins/echo`), una pestaña nueva no provocaría ninguna emisión y el
gráfico arrancaría **vacío hasta el siguiente tick** — con un intervalo de un minuto, en una demo eso
parece roto.

La solución ya está inventada en el repo: `plugins/provider-debug` registra **un subscriber proxy por
instancia** desde `addObject`, en vez de suscribir el canal entero. Así `addSubscriber` se invoca por
pestaña, y el provider puede empujarle su buffer **en el acto**.

Por tanto:

- La suscripción no lleva payload: hay una sola cuenta y un solo flujo. `addSubscriber(subscriber, {})`.
- En `addSubscriber`, el provider emite **inmediatamente** a ese subscriber un evento con la ventana
  completa que tenga en memoria.
- Después, en cada muestra nueva, emite **solo la muestra nueva** a todos los subscribers.

```ts
// providers/sugarless/src/common/Sugarless.ts

export enum EGlucoseUnit {
    MGDL = 'mg/dL',      // GlucoseUnits / uom = 1 (confirmado, §8)
    MMOLL = 'mmol/L'
}

export interface IGlucoseSample {
    /** epoch ms, parseado del FactoryTimestamp (UTC). Nunca del Timestamp local — ver §8 */
    timestamp: number
    /** valor en la unidad de la cuenta */
    value: number
    /** TrendArrow tal cual lo da la API: 1..5, siendo 3 = estable */
    trend: number
    /** los da Abbott ya calculados; no se recalculan en el front */
    isHigh: boolean
    isLow: boolean
}

export enum ESugarlessPayload {
    SNAPSHOT = 'snapshot',   // ventana completa; se envía al suscribirse
    SAMPLE = 'sample',       // una muestra nueva
    NO_DATA = 'nodata',      // conexión buena, sin lectura actual (glucoseMeasurement null)
    ERROR = 'error'          // fallo de login, de red, de versión o de configuración
}

export interface ISugarlessEvent {
    payloadType: ESugarlessPayload
    samples?: IGlucoseSample[]   // SNAPSHOT
    sample?: IGlucoseSample      // SAMPLE
    error?: string               // ERROR
    unit: EGlucoseUnit
    /** rango objetivo del paciente (targetLow/targetHigh de la conexión), en la unidad de la cuenta */
    targetLow?: number
    targetHigh?: number
}
```

**`NO_DATA` no es un error, y la distinción no es cosmética.** LibreLinkUp no lee el sensor: lee lo que
la app del paciente ha subido a la nube. Si el móvil no ha sincronizado hace poco, la conexión existe
y `glucoseMeasurement` llega `null`. Tratarlo como error pintaría una alarma cada vez que el teléfono
del paciente tarda en subir, que es lo normal y no un fallo.

**La unidad no se convierte.** El valor, el rango objetivo y los umbrales de alarma vienen todos en la
unidad de la cuenta, así que se propagan tal cual y el front solo etiqueta el eje. Cero conversiones,
cero errores de conversión. El caso raro — que el usuario cambie su unidad en la app de Abbott con el
buffer a medias, mezclando unidades en la ventana — se acepta: es una demo, y se arregla parando y
arrancando el canal.

El enum vive en `src/common` del provider porque cruza la frontera back↔front y back↔plugin.

> **Acoplamiento de tipos entre artefactos.** El plugin necesita conocer `ISugarlessEvent`, pero no
> puede importar del paquete del provider. Se resuelve **duplicando** el tipo en el `src/common` del
> plugin. Son tres campos; la alternativa (publicar un paquete de tipos compartido para una demo) es
> peor. Queda escrito aquí para que la duplicación sea una decisión y no un descuido.

---

## 6. El plugin

**Decisión 2: el plugin solo muestra el gráfico.** Sin configuración propia: todo lo configurable vive
en el provider.

- Canal **autónomo**: `cluster: false` **y** `resourced: false`. Esto es identidad del producto, no un
  detalle: si el canal pidiera seleccionar pods para arrancar, la demo se desmontaría sola — y pedir
  ámbito de clúster para no mirar ni un pod la desmontaba igual. Se arranca con la view `none`, que
  hubo que cablear en el core para esto (ver `plans/instance-view-none/PLAN.md`).
- `requiresExtension: ["provider:sugarless:<ver>"]`, patrón de `plugins/echo`.
- `pauseable: true` (congelar el gráfico durante una explicación es útil), `modifiable: false`.
- Contenido de la pestaña: una gráfica de línea temporal, con
  - el valor actual en grande y la flecha de tendencia,
  - las bandas del rango objetivo pintadas al fondo, **con los valores que da la API**
    (`targetLow`/`targetHigh`: 70 y 150 en la captura de §8) — no hardcodeadas,
  - y un estado visible cuando no hay curva, que son **cuatro** casos distintos y el usuario tiene que
    poder separarlos sin abrir un log: *"sin credenciales configuradas"*, *"esperando la primera
    lectura"*, *"conexión bien pero el móvil del paciente no ha sincronizado"* (`NO_DATA`) y el error
    concreto que haya reportado el provider.
- `recharts` está disponible como global de Kwirth: **no se bundlea** (ver `feedback_no_bundle_external_deps`).

---

## 7. Fases

Cada fase entrega algo usable por sí solo.

> **F1 y F2 CERRADAS el 2026-09-11**, ambas validadas en vivo contra la API real. Dos cambios sobre
> lo planeado, los dos a mejor: el canal resultó ser **autónomo** (`cluster:false` + `resourced:false`,
> view `none`) en vez de cluster-scoped, lo que exigió cablear esa view en el core
> (`plans/instance-view-none/PLAN.md`); y el icono es un **SVG propio** del plugin, para lo que el core
> pasó a aceptar SVG en el campo `icon` del `package.json`, saneado con lista blanca.

**F1 — Provider operativo.** Configuración + persistencia partida + login + polling + dedupe + ring
buffer + snapshot al suscribirse + diálogo de configuración con test de credenciales + README.
*Verificable de punta a punta sin escribir una línea del plugin*, usando `plugins/provider-debug`
para ver los eventos en crudo. Ese es el MVP de la fase y la razón de ordenarlas así.

**F2 — Plugin con gráfico.** Canal cluster-scoped, suscripción por instancia, gráfica en vivo, los
tres estados vacíos, README.

**F3 — Cierre. ✅ CL9 completado el 2026-09-11**, salvo la publicación.

| # | Punto | Estado |
|---|---|---|
| 1 | harness | ✅ provider **81** · plugin **27** |
| 2 | e2e + métricas | ✅ `front/e2e/tests/sugarless.spec.ts` **4/4** · cobertura provider **91,11/75,75/92,59**, plugin **96,80/90,40/84,27** · histórico en el `docs/plan/` de cada artefacto |
| 3 | qa manual | ✅ validado por el usuario |
| 4 | guía | ✅ 4 páginas nuevas (guía + referencia, de provider y de plugin) y 9 puntos de índice/sidebar |
| 5 | backlog | ✅ este documento |
| 6 | plan | ✅ este documento |
| 7 | commit | ✅ |
| 8 | tag | ✅ `provider/sugarless@0.1.0` · `plugin/sugarless@0.1.0` |
| 9 | push | ✅ |

**Pendiente, y es decisión del usuario: la publicación.** `npm publish` contra el registro público y las
entradas en `providers/manifest.json` y `plugins/manifest.json`. Es el único paso irreversible del cierre
y no se ha dado sin autorización explícita. Hasta entonces, los dos artefactos viven en
`back/kwirth-dev.json` y son perfectamente usables en el entorno de desarrollo.

Los tests y el README de cada artefacto son parte de "hecho" de su fase, no de F3.

---

## 8. Riesgos e incógnitas

**CERRADA con una lectura real** (2026-09-11). La respuesta capturada resolvió las tres incógnitas y
añadió tres cosas que no se esperaban.

La **forma** de abajo es la verificada sobre una lectura real; los **valores son de ejemplo**. Los
reales no se transcriben aquí, ni en los fixtures de test, porque son datos de salud de una persona y
este repositorio es público.

```json
"glucoseMeasurement": {
    "FactoryTimestamp": "7/4/2026 7:19:21 AM",
    "Timestamp":        "7/4/2026 9:19:21 AM",
    "type": 1, "ValueInMgPerDl": 112, "Value": 112, "GlucoseUnits": 1,
    "TrendArrow": 3, "TrendMessage": null, "MeasurementColor": 1,
    "isHigh": false, "isLow": false
}
```

1. **Formato de fecha** — resuelto, y con sorpresa: **hay dos marcas de tiempo y difieren en 2 horas**.
   `FactoryTimestamp` es **UTC** y `Timestamp` es **hora local**; la diferencia es exactamente el
   offset de la zona del paciente (2 h en la captura: España en horario de verano, CEST = UTC+2).
   Ambas en formato `M/D/YYYY h:mm:ss AM|PM`, no ISO-8601.
   **Decisión: se parsea `FactoryTimestamp` y se interpreta como UTC.** Usar `Timestamp` sería usar una
   hora local *sin offset*, que es ambigua por definición y se rompe dos veces al año en los cambios
   de hora — y se rompe dibujando una curva con un salto de una hora, no lanzando una excepción.
   El parseo es **explícito** (regex sobre los siete campos + `Date.UTC`), nunca `Date.parse()`.
2. **La unidad** — resuelto: `GlucoseUnits: 1`, `uom: 1` y `Value` (125) **idéntico** a
   `ValueInMgPerDl` (125). Por tanto **`1` = mg/dL**, confirmado por construcción.
3. **`TrendArrow`** — observado el valor `3` en una lectura plana, coherente con la hipótesis
   `1..5` (bajada rápida → subida rápida) y con `3` = estable. Un único punto no prueba el dominio
   completo, pero ya no es una suposición ciega. `TrendMessage` llegó `null`: no sirve como etiqueta.

**Los tres hallazgos extra**, todos aprovechables:

- **`targetLow: 70` y `targetHigh: 150`** vienen en la conexión: el rango objetivo **del paciente**.
  Las bandas del gráfico salen de la API y no se hardcodean (§6).
- **`isHigh` / `isLow`** ya vienen calculados por Abbott. No hay que recalcular el estado en el front.
- **`glucoseItem` es byte a byte idéntico a `glucoseMeasurement`** en la respuesta capturada. Se usa
  `glucoseMeasurement` y se ignora `glucoseItem`.

Queda además confirmado que **el host global sirve la lectura**: `https://api.libreview.io` y
`https://api-eu.libreview.io` devolvieron exactamente lo mismo para una cuenta con `region: eu`.

### Prerrequisito CONFIRMADO: hace falta una cuenta *seguidora*

Verificado el 2026-09-11, no inferido. Con el protocolo ya correcto (versión `4.16.0` y cabecera
`Account-Id`), `/llu/connections` responde **`HTTP 200` con `data: []`** usando las credenciales de la
cuenta paciente (`accountType: "pat"`). No es un error: es la API diciendo que esa cuenta no sigue a
nadie. `/llu/connections` no lista *tus* sensores, lista **los pacientes a los que esa cuenta sigue**.

El modelo de LibreLinkUp es de seguidor: el paciente comparte sus datos desde la app LibreLink, y es
la cuenta **seguidora** la que ve la lectura por API. Para que Sugarless reciba un solo dato hace falta,
fuera de Kwirth y una sola vez:

1. En la app LibreLink (paciente): invitar a un seguidor por email.
2. Aceptar la invitación desde la app LibreLinkUp con ese email.
3. Configurar en el provider las credenciales de **esa cuenta seguidora**.

No es un problema de código y no cambia el diseño, pero **sí es un bloqueo de la demo** hasta que esté
hecho, y tiene que estar en el README del provider: es el primer sitio donde va a encallar cualquiera
que intente reproducirla.

Lo que sí queda confirmado es que **la cuenta del paciente no sirve** para esto, así que las
credenciales que van en la configuración del provider son siempre las de la cuenta seguidora.

**Otros riesgos**

| Riesgo | Mitigación |
|---|---|
| API no oficial: puede cambiar o cortar por abuso | Intervalo por defecto de 60 s con mínimo validado; nunca reintentar en bucle un login fallido; reportar el error y esperar al siguiente ciclo. |
| Se manejan **datos de salud reales** del usuario | Credenciales y email al Secret. Y al documentar: difuminar valores y email en las capturas (`feedback_guide_redact_pii`). |
| Confundirlo con un producto médico | README y UI dejan claro que es una **demo de integración**, no un dispositivo médico, y que no debe usarse para decisiones de tratamiento. Las bandas de referencia son orientativas. |
| El histórico se pierde al reiniciar el core | Aceptado explícitamente en v1 (decisión 3). |
| `requiresRestart` | El provider expone `configRouter`, y el core engancha routers **solo al arrancar**: `requiresRestart: true`. Instalado en caliente daría 404. |

---

## 9. Decisiones cerradas

| # | Decisión | Fecha |
|---|---|---|
| 1 | Provider propio; `http-pull-push` no se toca ni se enriquece | 2026-09-11 |
| 2 | El plugin solo muestra el gráfico; sin configuración propia | 2026-09-11 |
| 3 | Histórico en memoria del provider, con tope `maxSamples` configurable | 2026-09-11 |
| 4 | Credenciales en la configuración del provider, partidas a Secret con `ConfigStore` propio | 2026-09-11 |
| 5 | Un subscriber por instancia + snapshot al suscribirse (derivada, ver §5.5) | 2026-09-11 |
| 6 | La región se configura en el provider; sin autodescubrimiento | 2026-09-11 |
