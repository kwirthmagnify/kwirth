# Geppetto — analizador LLM de propósito general · PRD

> Plugin de Kwirth. Documento de definición de producto (previo a diseño técnico y código).
> Estado: **decisiones 1–5 cerradas (2026-09-10); abierta la 6 (adjuntos en Teams)**.
> Plugin **libre** (público, npm + manifest público).
> Origen: al revisar Pinocchio (2026-09-10) se confirmó que su formato de salida está embebido en el
> código y que su UI está casada con un esquema de seguridad. En vez de diluir Pinocchio, se separa:
> **Pinocchio se queda en seguridad** y **Geppetto es el analizador libre**.

---

## 1. Resumen ejecutivo

**Geppetto es un pipeline de cuatro etapas, y las cuatro las configura el usuario:**

```
  TRIGGER            PROMPT              OUTPUT               SENDER
  qué lo dispara  →  qué se le pide  →   qué forma tiene  →   a dónde va
                                         la respuesta
  evento k8s         system + prompt     text · json ·        teams · email ·
  evento negocio     plantilla Jinja     image                fichero · webhook…
                     tools agénticas     + cómo se pinta      + cuándo y con qué texto
```

Hoy Kwirth tiene tres plugins con IA y los tres traen las cuatro etapas de fábrica: Pinocchio devuelve
un informe de postura de seguridad, Censor y Montag devuelven patrones de ruido en logs. Si lo que
quieres es *"cuando se despliegue algo en producción, comprueba si respeta nuestra convención de
etiquetado y, si no, avisa al canal de Teams del equipo"*, no hay dónde ponerlo.

Geppetto es esa pieza: disparadores sobre eventos de Kubernetes y de negocio, prompts con plantillas,
herramientas agénticas, versiones de prompt — **sin ningún producto encima**, y con salida hacia el
sistema de senders que Kwirth ya tiene.

Es la marioneta que te fabricas tú.

### Qué NO es

| No es | Eso ya es |
|---|---|
| Un chat con el cluster | **Agora** (salas multi-usuario con bots por cluster, de pago) |
| Un producto de seguridad | **Pinocchio** |
| Un filtro de ruido en logs | **Censor** (libre) / **Montag** (de pago) |
| Un motor de alertas por umbrales | **Alert** |

⚠️ **Frontera con Agora, deliberada:** Geppetto es **dirigido por eventos**, nunca conversacional. No
tendrá caja de chat ni sesiones. Reacciona a lo que pasa; no responde a lo que preguntas. En cuanto se
cruce esa línea empieza a competir con un producto de pago de la casa.

---

## 2. Objetivos

1. Que un usuario pueda montar un análisis LLM útil **de punta a punta** —del evento a la notificación—
   sin tocar código ni esperar a una versión del plugin.
2. Que el resultado se vea **bien** aunque el formato sea inventado por el usuario, no un volcado de
   JSON crudo.
3. Ser el gancho libre que enseña de qué es capaz la IA en Kwirth, y que empuja hacia los de pago.

---

## 3. Personas

- **SRE / plataforma** — "cuando entre un Ingress nuevo, dime si el host casa con nuestra convención de
  DNS, y si no, avísame por Teams".
- **Arquitecto / gobierno** — "cada Deployment nuevo: ¿cumple nuestras políticas de recursos, etiquetas
  y sondas? Dame una tabla OK/KO y deja constancia en un fichero".
- **Responsable de negocio** — sobre eventos del provider `business`: "resume en dos frases qué ha
  pasado con este pedido y, si hay que escalarlo, manda un correo".
- **Integrador / partner** — usa Geppetto para prototipar un analizador antes de decidir si merece un
  plugin propio.

> **Ejemplo — un miércoles cualquiera:**
> Marta (plataforma) quiere vigilar que nadie despliegue sin `resources.limits`. Crea un trigger sobre
> `Deployment`/`ADDED`, escribe el prompt, y en *Output* pega el ejemplo
> `{"ok": true, "summary": "", "containers": [{"name": "", "verdict": "ok|ko", "reason?": ""}]}`. Elige
> renderizado **tabla**. En *Send* enlaza el sender de Teams del equipo con la condición `ok = false` y
> un cuerpo `{{ summary }}`. En el canal ve una tabla por despliegue, y sólo le llega ruido a Teams
> cuando algo falla. No ha pedido una feature a nadie.

---

## 4. Alcance

### En V1

**Trigger** — providers `events` (kind + tipo de evento k8s) y `business` (space.type). **Versiones**
por trigger (A/B de prompts) con enable/disable independiente.

**Prompt** — system + prompt con plantilla Jinja (nunjucks) sobre el objeto disparador, o el artefacto
crudo. Herramientas agénticas del catálogo de `kwirth-common-ai` (`toolInfoList`), con selección manual
o automática y tope de pasos.

**Output** — formato de salida configurable: `text`, `json`, `image` (§6) y renderizado configurable
(§7).

**Sender** — enrutado del resultado a los senders de Kwirth, con condición y plantilla de cuerpo (§8).

**Transversal** — playground que ejecuta **exactamente** lo mismo que producción (las cuatro etapas,
con envío en seco); import/export de triggers como JSON; reutilización del **AI config compartido**
(providers y LLMs) sin catálogos propios; RBAC con scopes declarados por el plugin.

### Fuera de V1

- Persistencia de resultados en base de datos (Geppetto es libre y no arrastra Postgres).
- Acciones sobre el cluster derivadas del resultado (parchear, cancelar). Eso es admission control y es
  otro producto.
- Chat / preguntas ad-hoc → es Agora, y no se va a cruzar.
- Multi-cluster / federación.
- Catálogo compartible de plantillas entre instalaciones (en V1 el catálogo **es** la guía).

---

## 5. Arquitectura — DECIDIDO: dos plugins 100% independientes

**Geppetto y Pinocchio no comparten código. Pinocchio no se toca.** No hay extracción de motor, no hay
Fase 0, y Geppetto no hereda deuda de Pinocchio.

### Lo que esto significa, por escrito

Medido sobre Pinocchio: **~2.100 líneas de motor** (editor de triggers 402, playground 603,
protocolo/import-export/menú ~420, motor del back ~700) contra ~250 específicas de seguridad. Esas
~2.100 líneas se van a escribir dos veces, y **cada bug del motor habrá que arreglarlo dos veces**. Hay
precedente en casa: Censor y Montag son un fork literal (3.305 vs 4.915 líneas, mismos ficheros con el
prefijo cambiado) y ya se convive con ello.

Se asume **a conciencia**, y a cambio se compra: cero riesgo de regresión sobre Pinocchio (que un
cliente está probando ahora mismo), cero peaje de cascada de `common-ai` para iterar el motor, y
libertad total para que Geppetto diverja desde el minuto uno — que la va a necesitar, porque el
pipeline de cuatro etapas no es la forma de Pinocchio.

### El matiz: independientes entre sí, no del común

`kwirth-common-ai` **sí** se usa, igual que lo usan censor, montag, agora e iter: `buildModel`,
`loadModels`, `zodFromExample`, las tools, y los diálogos `AiConfigProvider`/`AiConfigLlm`/
`LlmSelector`/`ToolSelector` de `common-ai/front`. La independencia es **plugin a plugin**, no respecto
a los paquetes comunes de la casa — si no, habría que duplicar también el motor de IA, y eso sí que no
lo quiere nadie.

> Esto es coherente con la decisión #2: ampliar `zodFromExample` toca `common-ai`, que es común y
> compartido con Censor. Es el sitio correcto.

**Punto de partida práctico**: se puede arrancar copiando el andamiaje de Pinocchio (canal, protocolo
WS, import/export) como plantilla, pero desde ese momento son dos bases de código distintas y no se
sincronizan.

---

## 6. Etapa OUTPUT (1/2): el formato

### 6.1 Modalidades

| Modalidad | Qué se le pide al modelo | Cómo |
|---|---|---|
| **`text`** | Texto libre | `generateText` |
| **`json`** | Salida estructurada contra un esquema derivado de un ejemplo | `Output.object({ schema: zodFromExample(...) })` |
| **`image`** | **Una imagen de verdad**, generada por el modelo | `generateImage` — §6.4 |

### 6.2 Modo `json`: el ejemplo como contrato — DECIDIDO: se amplía el inferidor

El usuario pega un **ejemplo de JSON** y Geppetto lo convierte en contrato con
[`zodFromExample`](common-ai/src/back.ts#L245), el mismo mecanismo que ya usa Censor.

Hoy `inferZod` infiere por el primer elemento de cada array y sólo distingue string / number / boolean
/ objeto / array. **No sabe de enums, ni de opcionales, ni de descripciones.** Se amplía en `common-ai`
con tres convenciones sobre el propio ejemplo — **sin inventar un lenguaje nuevo y sin sintaxis
ajena al JSON**:

| Convención | Ejemplo | Produce |
|---|---|---|
| **Enum** — string con `\|` | `"verdict": "ok\|warn\|ko"` | `z.enum(['ok','warn','ko'])` |
| **Opcional** — clave acabada en `?` | `"reason?": ""` | `reason` opcional (la clave real es `reason`) |
| **Descripción** — string no vacío y sin `\|` | `"reason": "por qué falla la política"` | `z.string().describe('por qué falla la política')` |

La tercera es la que más va a mejorar la calidad del resultado y **no cuesta nada al usuario**: la
descripción viaja al JSON Schema que ve el modelo, y la gente ya escribe ejemplos con contenido
dentro. Un ejemplo literal (`"model": "gpt-5"`) también funciona como guía, así que no hay caso malo.

```json
{
  "ok": true,
  "summary": "resumen en una frase para la notificación",
  "containers": [
    { "name": "nombre del contenedor", "verdict": "ok|ko", "reason?": "por qué incumple" }
  ]
}
```

⚠️ **Retrocompatibilidad obligatoria.** `zodFromExample` lo usa Censor en producción. Los ejemplos
actuales (`{"patterns":[""]}` → string vacío → sin describe) deben seguir comportándose **exactamente
igual**. Las tres reglas son aditivas y sólo se activan ante contenido que hoy no significa nada.
Requiere test unitario de no-regresión en `common-ai` antes de publicar, y cascada a los dependientes.

### 6.3 Cuando el modelo no cumple

Structured output ya obliga bastante, pero puede fallar (modelo pequeño, endpoint `openai-compat`
tosco). Regla: **nunca se pierde la salida**. Si la validación falla, el resultado se guarda con
`format: 'raw'` y se pinta el texto crudo con un aviso, en vez de descartarlo.

### 6.4 Modo `image` — DECIDIDO: generación real de imagen

No es un diagrama renderizado a partir de texto: **el modelo produce una imagen**. Esto es lo que hay
hoy y lo que falta, comprobado sobre las dependencias reales de `common-ai`:

| Pieza | Estado |
|---|---|
| `generateImage` en el SDK | ✅ existe en `ai@6.0.188` (`generateImage` + `experimental_generateImage`), **sin re-exportar** en `common-ai/back` |
| Proveedores con imagen real | ✅ **openai**, **google**, **openrouter** |
| Proveedores que **lanzan** al pedir imagen | ❌ **anthropic, groq, deepseek, mistral** — `No such imageModel` |
| `openai-compat` | ⚠️ estructuralmente sí (`createOpenAI` con `baseURL` expone `.image()`), pero depende de que el endpoint sirva `/v1/images/generations`. No verificable a priori |
| `buildImageModel` | ❌ **no existe**. `buildModel` devuelve `LanguageModel`; la imagen necesita `provider.image(modelId)` |
| Catálogo de modelos | ⚠️ `ILlmModel.type` ya contempla `'image'`, pero **`loadModels` marca todo como `'text'`** — el selector no puede filtrar modelos de imagen |

**Lo que hay que construir:**

1. `buildImageModel(llm, providers)` en `common-ai/back`, hermano de `buildModel`, con un `switch` por
   tipo que **falle con mensaje claro** en los cuatro proveedores que no soportan imagen — no con un
   throw críptico del SDK.
2. Re-export de `generateImage` en `common-ai/back` (regla de la casa: no bundlear el SDK en el plugin).
3. Transporte y almacenamiento: la imagen vuelve como base64. Una PNG de 1024×1024 ronda 1–2 MB, ~1,4–2,7
   MB ya en base64, **por resultado**. Va por el WebSocket del canal y al historial en memoria.
   👉 **Esto ata directamente con la decisión #5**: un buffer de N resultados deja de valer; el tope
   tiene que ser **por bytes**, y probablemente las imágenes deban vivir aparte con expiración.
4. Render: `<img>` sobre un data URL, con lightbox y descarga.
5. Marcar el `type` correcto en `loadModels` para openai/google/openrouter, para que el selector pueda
   ofrecer sólo modelos válidos. Sin esto, el usuario elige un modelo de texto y se lleva un error en
   tiempo de ejecución.

**Y el hueco de los senders — ahora en el camino crítico.** `ISenderMessage` es
`{subject?, body, to?, level?, metadata?}`: **no tiene adjuntos**. Como la imagen es un **entregable** y
el vehículo es el sender (decisión #5), esto deja de ser un "ya veremos" y se convierte en trabajo
obligatorio de la fase de imagen. Ver §8.1.

> ❓ **Pregunta abierta de producto:** ¿cuál es el caso de uso concreto? Saber si apuntas a *"a partir
> de este análisis, dibuja el diagrama de arquitectura"* o a *"ilustra el informe"* cambia el prompt
> por defecto, el tamaño/relación de aspecto y si hace falta encadenar análisis → imagen (dos llamadas:
> una de texto que analiza y otra que dibuja) o basta una sola.

---

## 7. Etapa OUTPUT (2/2): el renderizado

Es el riesgo de producto principal: **un formato libre mal pintado es peor que un formato fijo bien
pintado**. Sin esto, Geppetto es un visor de JSON y nadie lo usa dos veces.

### 7.1 Renderers de V1

| Renderer | Entrada | Pinta |
|---|---|---|
| `text` | string | Texto plano |
| `markdown` | string | `MarkdownViewer` de `common-front` (ya existe) |
| `json` | cualquiera | Árbol plegable, con copiar |
| `table` | array de objetos | Tabla con columnas inferidas de las claves |
| `list` | array de objetos | Lista con **mapeo de campos** (§7.2) |
| `image` | imagen | `<img>` con lightbox y descarga |
| `auto` | — | Heurística: imagen → image · string → markdown · array de objetos → table · resto → json |

### 7.2 El mapeo de campos — la idea que hace que esto funcione

La UI rica de Pinocchio (lista coloreada por severidad, click para ver el detalle) **no es específica de
seguridad**: es "una lista de cosas, cada una con un título, un nivel y un cuerpo". Lo único específico
son los nombres de los campos.

Así que el renderer `list` no conoce ningún campo: el usuario **mapea** los suyos.

| Ajuste | Qué hace | Ejemplo |
|---|---|---|
| `itemsField` | Qué array del resultado es la lista | `containers` |
| `titleField` | Qué campo es el título de cada elemento | `name` |
| `levelField` | Qué campo colorea el elemento | `verdict` |
| `bodyField` | Qué campo es el texto principal | `reason` |
| `headerField` | Qué campo del resultado va en la cabecera | `summary` |

Los campos no mapeados se muestran en el diálogo de detalle como pares clave/valor. Con esto, cualquier
JSON del usuario obtiene el 80% de la calidad visual de Pinocchio sin que Geppetto sepa de seguridad.

**Paleta de niveles:** valores conocidos coloreados por defecto (`critical`/`high`/`medium`/`low`,
`error`/`warn`/`info`, `ko`/`warn`/`ok`, `true`/`false`), el resto en neutro. Sin paleta configurable en
V1.

---

## 8. Etapa SENDER: sacar el resultado de Kwirth

Kwirth ya tiene el sistema montado: el core inyecta `ISenderAccess` en el back de cualquier plugin
(`send`, `listSenders`, `getConfig`), y ya lo consumen agora, alert, censor, echo, excubitor y montag.
Hay nueve senders de serie (consola, fichero, SMTP, Resend, Teams, composite, timed, tee, regex).

Cada versión de trigger lleva **cero o más envíos**, y cada envío es:

| Campo | Qué es |
|---|---|
| `senderId` + `configName` | Qué sender y qué config, elegidos de `listSenders()` |
| `condition` | **Cuándo** enviar: siempre, o `campo` + operador (`=`, `≠`, `∈`, `>`, `<`) + valor, evaluado sobre el resultado |
| `subject` / `body` | Plantillas **Jinja sobre el resultado** — nunjucks ya es dependencia |
| `level` | `debug`/`info`/`warning`/`error`, fijo o tomado de un campo del resultado |

Decisiones de diseño, con su porqué:

- **Condición declarativa, no expresión.** Un campo + operador + valor cubre lo que la gente necesita y
  evita meter un lenguaje de expresiones (y su superficie de seguridad) en un plugin libre. Si se queda
  corta, el prompt puede pedir explícitamente un booleano al modelo.
- **El cuerpo por defecto no es vacío**: si no hay plantilla, se manda el texto renderizado (`text`) o
  el JSON formateado (`json`). Que funcione sin configurar nada.
- **Los fallos de envío no tumban el análisis**: se registran como aviso en el canal y el resultado se
  muestra igual.
- **`metadata`** lleva `triggerId`, `versionId` y el `source`, para que un sender de ticketing o un
  composite pueda enrutar.

### 8.1 Adjuntos — el sender es el entregable

Decisión #5: **el canal es una vista viva y lo que se conserva es lo que salió por un sender.** Eso
obliga a que un sender pueda llevar la imagen. Se amplía el contrato en `common`:

```
ISenderMessage
  subject?, body, to?, level?, metadata?
  attachments?: { filename, mediaType, base64 }[]      // NUEVO
```

**Es un cambio aditivo**: ningún sender se rompe, los que no lo soporten simplemente lo ignoran.
Verificado sobre las nueve implementaciones (todas reciben `ISenderMessage` y sólo leen los campos que
usan):

| Sender | Adjuntos | Trabajo |
|---|---|---|
| **email-smtp** | ✅ | `transporter.sendMail({ attachments })` de nodemailer — trivial |
| **email-resend** | ✅ | `attachments` de la API de Resend — trivial |
| **file** | ✅ | Escribir un fichero hermano junto al log; hay que definir nombrado y ruta |
| **composite**, **tee** | ✅ | Gratis: reenvían el `ISenderMessage` entero |
| **console**, **regex**, **timed** | n/a | No transportan contenido binario por naturaleza |
| **teams** | ❌ | **No puede** — ver §16 |

### 8.2 Riesgo de tormenta de notificaciones

Un trigger sobre `Pod`/`MODIFIED` en un cluster vivo puede
dispararse cientos de veces por minuto. Mitigación en V1: los triggers nacen **deshabilitados**, el
`usage` es visible en cada resultado, y la UI muestra el contador de envíos. Un anti-flood real
(agrupación, ventana temporal) es V2 — y para eso ya existe el sender `timed`.

---

## 9. Modelo de dominio

> ⚠️ Tipos propuestos, **pendientes de validación** antes de escribirlos (regla del proyecto). Los
> `string union` irán como **enums en `src/common`** del plugin, no como literales sueltos.

```
ITrigger
  id, source: events | business, kind?, k8sEvent?, spaces[], versions[]

ITriggerVersion
  id, description, enabled
  llm, temperature, steps, tools[], autoTools          // etapa PROMPT
  system, promptType: jinja | artifact, prompt         // etapa PROMPT
  output: IOutputSpec                                  // etapa OUTPUT
  sends: ISendSpec[]                                   // etapa SENDER

IOutputSpec
  mode: text | json | image
  example?                                             // JSON de ejemplo, sólo en mode=json
  imageOptions?: { size?, aspectRatio?, n? }           // sólo en mode=image
  render: auto | text | markdown | json | table | list | image
  mapping?: { itemsField?, titleField?, levelField?, bodyField?, headerField? }

ISendSpec
  enabled, senderId, configName
  condition?: { field, op: eq | ne | in | gt | lt, value }
  subject?, body?                                      // plantillas Jinja sobre el resultado
  level?: { fixed } | { field }

IResult                                                // el sobre genérico que viaja al front
  timestamp, text?                                     // 'text' = línea de cabecera
  triggerId, versionId, format
  data: unknown                                        // salida del modelo, validada
  image?: { mediaType, base64 }                        // sólo en mode=image; vive sólo en el buffer
  usage?: { input, output }
  source?: unknown                                     // objeto k8s / evento que lo disparó
  sends?: { senderId, configName, ok, error? }[]       // qué se envió y cómo fue
```

Geppetto **no hereda** tres cosas de Pinocchio, a propósito:

- **`action: inform | cancel | repair`** — en Pinocchio se configura en la UI y no se usa en ninguna
  parte del back: es config muerta.
- **`hardened_yaml`** — decisión #4: no existe en Geppetto. (Pinocchio se queda como está.)
- **El `system` pisado** — en el trigger `business` de Pinocchio, el system del usuario se sobrescribe
  con un literal fijo. En Geppetto el system del usuario se respeta siempre.

Y añade **`temperature` por versión**, que en Pinocchio sale del LLM y no se puede afinar por trigger.

---

## 10. Encaje en Kwirth

- **Canal**: `geppetto`, cluster-scoped, no routable, pausable, sin setup dialog.
- **Providers**: se suscribe a `events` y `business`. **No** a `metrics` — Pinocchio lo hace y sólo
  llena un buffer que no usa.
- **AI config**: consume el almacén compartido (`kwirth-store-common-kwirth-ai-providers` / `-llms`) vía
  `readStorageCommon`, y edita con los diálogos de `kwirth-common-ai/front`, incluido `onLoadModels`
  contra `/core/aiconfig/loadmodels`. Sin catálogos de proveedores propios: la lista de tipos sale de
  `PROVIDERS_AVAILABLE` (la lección de la 0.2.31 de Pinocchio).
- **Senders**: vía `backChannelObject.senders`. Geppetto **no** configura senders: elige entre los que
  ya haya instalados y configurados en Kwirth.
- **Config propia**: `geppetto-config` en ConfigMap del canal, con los triggers.
- **RBAC**: scopes declarados por el plugin — `geppetto:view` y `geppetto:configure`.
- **Docs**: página propia en la guía (`guide/extensions/plugins/geppetto`) con **recetas listas para
  copiar**. La guía **es** el catálogo de plantillas en V1.
- **README** en la raíz del plugin (descripción, config, ejemplos).

### Requisitos no funcionales

- **No bundlear SDKs** (`ai`, `zod`, nunjucks): usar los re-exports globales de `kwirth-common-ai/back`.
  Esto incluye `generateImage`, que hay que añadir a los re-exports.
- Iconos MUI por el **barrel** (`@mui/icons-material`), nunca deep imports.
- UI y logs en **inglés**; comentarios del código en español.
- Diálogos: tamaño fijo, Cancel a la derecha, controles siempre visibles y `disabled`, confirmaciones
  con `setMsgBox`.
- Cierre con **CL9** completo, incluido harness + e2e propios y su `docs/plan/test-metrics-history.md`.

---

## 11. Plan de entrega — cada fase es un MVP usable

| Fase | Entrega | Ya sirve para |
|---|---|---|
| **1** | Canal + **trigger** + **prompt** + modo `text` + renderers `text`/`markdown` + playground alineado con producción | "reacciona a este evento y dame una explicación en prosa" |
| **2** | **Senders**: enrutado con condición y plantillas | producto completo de punta a punta |
| **3** | Modo `json` + ampliación de `zodFromExample` en `common-ai` (con test de no-regresión y cascada) + renderers `json` y `table` | veredictos y tablas |
| **4** | Renderer `list` + mapeo de campos + diálogo de detalle genérico | la UI rica, sin seguridad |
| **5** | Modo `image` — **la mitad del trabajo está fuera del plugin**: `buildImageModel` + re-export de `generateImage` + `type` correcto en el catálogo (`common-ai`), `attachments` en `ISenderMessage` (`common`), soporte real en los senders file/smtp/resend, y render con lightbox en Geppetto | el análisis dibuja **y el dibujo se entrega** |
| **6** | Import/export, recetas en la guía, pulido | producto redondo |

No hay Fase 0: Pinocchio no se toca (decisión #1).

Los senders van antes que el JSON porque son core: con `text` + senders ya hay un producto que alguien
usa en producción; con `json` sin senders sólo hay una pantalla bonita.

⚠️ **La fase 5 no es una fase de Geppetto, es media casa.** Toca `common` (contrato de senders),
`common-ai` (modelo de imagen y catálogo), tres senders y el plugin. Arrastra cascada de publicación en
dos paquetes comunes. Conviene planificarla como bloque propio y no como "un modo más".

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Duplicación con Pinocchio** — cada bug del motor, dos veces | Asumido a conciencia (§5). Mitiga: mantener los nombres de fichero y la estructura paralelos, para que un fix sea fácil de portar a mano |
| **El renderizado genérico queda pobre** y Geppetto es "un visor de JSON" | El mapeo de campos (§7.2) es la respuesta, y por eso es fase propia |
| **Ampliar `zodFromExample` rompe Censor** | Reglas puramente aditivas + test de no-regresión en `common-ai` antes de publicar |
| **Imagen: memoria y transporte** | Buffer con tope **por bytes**, no por número de resultados (§15). Si te la quieres quedar, la sacas por un sender |
| **Ampliar `ISenderMessage` toca `common`** | Cambio aditivo, verificado contra las nueve implementaciones: ningún sender se rompe. Pero arrastra cascada de publicación |
| **Imagen: el usuario elige un modelo que no puede generar** | Marcar `type` en el catálogo y filtrar el selector; mensaje de error claro en `buildImageModel` para los cuatro proveedores sin soporte |
| **Tormenta de notificaciones** | §8: triggers deshabilitados al nacer, contador visible; anti-flood real en V2 vía sender `timed` |
| **Solape con Agora** | Frontera dura: dirigido por eventos, nunca chat. Sin sesiones, sin caja de texto |
| **Coste de tokens descontrolado** | Tope de pasos por versión, `usage` visible en cada resultado |
| **Canibalizar Pinocchio** | Geppetto no trae análisis de seguridad de fábrica; la receta de seguridad de la guía apunta a Pinocchio |

---

## 13. Métricas de éxito (V1)

1. Un usuario monta un análisis útil **de punta a punta** (evento → notificación) sin escribir código y
   sin leer más que la página de la guía.
2. Las recetas de la guía cubren los tres modos (`text`, `json`, `image`) con ejemplos ejecutables.
3. Censor sigue verde tras la ampliación de `zodFromExample`.
4. Pinocchio no ha cambiado ni una línea.

---

## 14. Decisiones

| # | Decisión | Estado |
|---|---|---|
| 1 | **Dos plugins 100% independientes.** Sin motor compartido, sin Fase 0, Pinocchio intacto. `common-ai` sí se comparte (§5) | ✅ **CERRADA** |
| 2 | **Se amplía `zodFromExample`** con enums, opcionales y descripciones, de forma aditiva y retrocompatible (§6.2) | ✅ **CERRADA** |
| 3 | **`image` = generación real de imagen** (§6.4) | ✅ **CERRADA** — falta acotar el caso de uso |
| 4 | **`hardened_yaml` no existe en Geppetto** (§9) | ✅ **CERRADA** |
| 5 | **Historial: sólo vivo. El entregable es lo que sale por el sender** (§15) | ✅ **CERRADA** |
| 6 | **Cómo se entrega una imagen a Teams**, que no admite adjuntos (§16) | 🔴 **ABIERTA** |

---

## 15. El principio que ordena el producto

> **El canal es una vista viva. Lo que se conserva es lo que salió por un sender.**

De ahí se deriva todo lo demás, y conviene tenerlo escrito porque resuelve solo un montón de preguntas
de diseño:

- **Sin persistencia.** Ni Postgres ni ConfigMap. El historial es un **buffer en memoria del back** que
  muere con el canal, con **tope por bytes** (no por número de elementos: una imagen de 2 MB no puede
  desalojar veinte análisis de texto). Se reenvía al reconectar, para que la reconexión no duela.
- **Sin almacén de imágenes ni expiración ni endpoint que las sirva.** La opción "C" que estaba sobre la
  mesa desaparece: no hace falta, porque la imagen que importa ya se ha entregado.
- **Los adjuntos en senders pasan a ser obligatorios** para la fase de imagen (§8.1). Si el sender no
  puede llevar la imagen, la imagen no es un entregable y la decisión #5 se cae.
- **La UI debe dejarlo claro.** Un resultado con imagen que no tenga ningún envío configurado es un
  entregable que se va a perder: la UI debería avisarlo, no dejar que el usuario lo descubra al cerrar
  la pestaña. Hay botón de descarga manual como red de seguridad, pero no es el camino previsto.

---

## 16. Decisión abierta #6: la imagen y Teams

Aquí es donde chocan las dos respuestas — *sólo vivo* y *entregables* — y hay que elegir.

El sender de **Teams** publica una `MessageCard` contra un *incoming webhook*
([teams/index.ts:46](senders/teams/src/back/index.ts#L46)). Ese formato **no admite adjuntos binarios**:
sólo puede mostrar una imagen si le das una **URL públicamente alcanzable**. Y servir una URL exige
alojar la imagen en algún sitio durante un tiempo — justo lo que "sólo vivo" dice que no hacemos.

| Salida | Qué implica | Coste |
|---|---|---|
| **A · Teams se queda en texto** | La tarjeta lleva el texto y un aviso de que hay imagen; la imagen se entrega por correo o fichero | Cero. Coherente con "sólo vivo" |
| **B · URL efímera** | Kwirth sirve la imagen en un endpoint con token y caducidad corta; Teams la embebe | Rompe "sin almacén": reintroduce ciclo de vida, expiración y una URL sin autenticar (o con token en la URL, que acaba en el historial de Teams) |
| **C · Teams fuera del alcance para imagen** | Documentado: si quieres la imagen, usa correo o fichero | Cero, pero es una limitación visible en la guía |

Mi recomendación: **A**, que en la práctica es C con mejores modales — la tarjeta avisa y el entregable
va por el canal que sí puede llevarlo. B sólo si Teams es el destino real de tu caso de uso, y en ese
caso conviene saberlo **antes** de diseñar la fase 5, porque cambia el alcance.

### Y sigue pendiente de acotar (no bloquea, pero afina la fase 5)

¿Cuál es el **caso de uso** de la imagen? No es lo mismo *"a partir de este análisis, dibújame el
diagrama"* — dos llamadas encadenadas, una que analiza y otra que dibuja — que *"ilustra el informe"*,
que es una sola. Cambia el prompt por defecto, el tamaño y la relación de aspecto, y si `IOutputSpec`
necesita **dos** prompts o uno.
