# Control de uso de los servicios de IA

> **Estado: PRD, pendiente de validación.** No hay PLAN todavía.

## Por qué

Hoy Kwirth no sabe cuánto gasta en IA, y no puede impedir que gaste más. Ocho plugins hacen **28 llamadas
a un LLM** y ninguna está contada: un bucle en un trigger de Pinocchio, un Excubitor analizando un
landscape entero o un Agora conversando sin parar consumen lo que haga falta, y el administrador se entera
cuando llega la factura del proveedor.

El objetivo no es observar el gasto: es **cortarlo**. Contar es el medio.

## Lo que el reconocimiento estableció

Antes de diseñar nada se comprobó cómo se habla hoy con los LLM. Es mejor de lo que parecía:

| pregunta | respuesta |
|---|---|
| ¿alguien importa el SDK (`from 'ai'`) directamente? | **No.** Solo `common-ai/src/back.ts` |
| ¿alguien crea un cliente de proveedor por su cuenta (`createOpenAI`…)? | **No.** Solo `buildModel()` |
| ¿el front llama a LLM? | **No.** Todo sale del back |
| ¿las aitoolsets llaman por su cuenta? | **No** |

🔴 **Y lo que lo decide todo: los plugins NO bundlean `common-ai`.** Sus `build.mjs` la mapean a
`global.__kwirth_back__.kwirthCommonAiBack`, que es **la copia del core**. El `generateText` que ejecutan
los 28 sitios es el del core, en el proceso del core.

Consecuencia directa: **envolver el re-export de `generateText` en `common-ai/src/back.ts` intercepta todo
el tráfico de IA de Kwirth, desde un único sitio, y corriendo donde el core tiene su SQL, su configuración
y su identidad.** Ningún plugin necesita cambios para que el conteo y el corte funcionen.

⚠️ Esto resuelve la objeción de que *"hay canales que no usan SQL, como pinocchio o censor"*: los
contadores **no son del canal, son del core**. Pinocchio y Censor no tocan la base de datos ni se enteran
de que existe.

## Decisiones tomadas

Por el usuario, no negociadas aquí:

| decisión | qué se hace |
|---|---|
| objetivo | **cortar**, no solo medir. Contar es el medio, no el fin |
| unidades | **tokens de entrada**, **tokens de salida**, **nº de llamadas** y **coste**. Cada una se **activa o desactiva** por separado, conservando sus números |
| ventanas | **diaria y mensual, configurables por separado**. Las dos a la vez, cada una con su tope |
| dónde se limita | en **dos** sitios: por **clave de LLM** (la del provider o la del modelo) y por **canal** |
| cómo se combinan | **una sola regla**: la llamada sale si **NINGÚN** tope activo está superado. En cuanto uno cualquiera se pasa —el eje que sea, la unidad que sea— se avisa y se corta, y el error dice cuál fue |
| al alcanzar el tope | **excepción tipada** desde `generateText`. Un solo sitio que tocar |
| dónde se guarda | **SQL cuando lo hay**; si no, **en memoria y avisando al arrancar**. Kwirth funciona sin SQL y no va a dejar de funcionar por esto |
| atribución | **todos los consumidores actuales se modifican** para pasar su `consumerId`. No hay cajón de «no atribuido» |
| alcance del tope | **de este Kwirth y solo de este Kwirth**. Ver *Varios clústeres* |

## Lo que hay que saber antes de tocarlo

🔴 **`usage` llega DESPUÉS de responder.** El SDK devuelve los tokens consumidos con la respuesta, no
antes. Por tanto:

- un tope **por llamadas** se aplica **antes** de llamar: la llamada que sobra no se hace;
- un tope **por tokens** solo puede frenar la **siguiente**: la llamada que cruza el límite ya se pagó.

No es un defecto de implementación, es cómo funciona el protocolo. La UI tiene que decirlo con esas
palabras, o el administrador creerá que un tope de tokens es una barrera y es un freno.

## Dónde se guardan los contadores

`common-sql` da `ensureDb(consumerId)` → una base de datos física propia por consumidor, con Knex encima.
El core pide la suya y crea **una tabla**, con una fila por (eje · sujeto · ventana · periodo):

| columna | qué es |
|---|---|
| `scope` | `llmkey` o `channel` |
| `subject` | huella de la clave efectiva, o el `consumerId` del canal |
| `period_kind` | `day` o `month` |
| `period_key` | `2026-10-06` o `2026-10` |
| `tokens_in` · `tokens_out` · `calls` | los tres contadores, en la misma fila |

Clave primaria las cuatro primeras. Cada llamada escribe cuatro filas (2 ejes × 2 ventanas) con un
`UPSERT … ON CONFLICT DO UPDATE SET tokens_in = tokens_in + ?`: **incremento atómico en la base**, no un
leer-modificar-escribir, así que dos instancias del mismo canal cuentan a la vez sin pisarse. Las tres
unidades viajan juntas porque escribir una cuesta lo mismo que escribir tres, y así cambiar de unidad en
la UI no obliga a empezar a contar de cero.

La ventana **se resetea sola**: al cambiar el día o el mes, `period_key` es otro y la fila nace a cero. No
hace falta trabajo programado para resetear, solo uno de limpieza para que las filas diarias viejas no se
acumulen.

🔴 **El sujeto del eje `llmkey` es una HUELLA, nunca la clave.** El tope sigue a la clave efectiva
—`useProviderKey ? provider.key : llm.key`, que `buildModel` ya resuelve— porque la clave es lo que el
proveedor factura: dos entradas de LLM que usan la misma clave **comparten presupuesto**. Se guarda un
hash, de modo que esa tabla no contiene secretos.

⚠️ **Sin SQL se cuenta en memoria, y se avisa al arrancar.** El SQL del core es `lazy` y puede no estar
configurado (`back/src/index.ts`: *"startup does not fail even when SQL is not available yet"*), y Kwirth
funciona sin él: desktop y ECS son casos normales, no averías. Los contadores en memoria **se pierden en
cada reinicio**, así que el aviso de arranque y la UI tienen que decirlo con esas palabras. Un tope que se
olvida al reiniciar sigue siendo mejor que ninguno, pero solo si nadie cree que es duradero.

## Varios clústeres

Cada Kwirth hace **sus propias** llamadas al LLM: `openRemoteChannels` lo cablea el front, abriendo un
websocket a cada clúster, y cada Kwirth remoto corre su propio back de canal con su propia configuración
de IA. Por tanto **los contadores y los topes son de cada Kwirth, y punto**.

⛔ **No se comparte la base entre clústeres.** Se valoró y se descarta: los clústeres **pueden no verse
entre sí**, y apuntarlos todos a un mismo SQL les mete una dependencia dura y un acoplamiento que hoy no
tienen — si esa base cae, todos se quedan sin IA. Federar contadores por nuestra cuenta sería peor:
inventar un protocolo de sincronización entre clústeres para un contador.

⚠️ Queda un residuo que Kwirth **no puede** resolver y que la documentación tiene que decir: si la misma
API key está configurada en varios Kwirth, **el proveedor la factura entera y ningún Kwirth ve el total**.
El tope de Kwirth es una barrera local, por despliegue. Quien quiera un techo de flota lo pone **donde
vive la clave**: en la cuota del propio proveedor del LLM, que es quien puede verla entera.

🔴 **La identidad del llamante no existe hoy en el punto de la llamada.** `buildModel()` lo llaman los
plugins, y lo que devuelve es un `LanguageModel` del SDK: no lleva ni el `ILlm` de Kwirth ni el canal. Eso
parte la función en dos mitades de coste muy distinto:

- **Por clave de LLM: gratis.** `buildModel()` ya recibe el `ILlm` y los providers. Puede anotar lo que
  devuelve (un `WeakMap` del modelo a su origen) y el envoltorio consultarlo. **Todo dentro de
  `common-ai`, cero cambios en plugins.**
- **Por canal: no.** Alguien tiene que decir quién llama. La vía menos invasiva es un tercer parámetro
  **opcional** en `buildModel(llm, providers, consumerId)`: los plugins que no lo pasen siguen compilando
  y cuentan como *no atribuido* hasta que se republiquen. Son ~20 sitios, una línea cada uno, en 8
  plugins.

⚠️ `AsyncLocalStorage` ya se usa en `common-ai` (`runWithToolContext`), pero solo para el contexto de
tools y solo cuando el llamante lo establece. No sirve como vía general: una llamada disparada por un
temporizador o por un evento llega sin contexto, y la atribución fallaría en silencio — que es peor que no
atribuir.

## Alcance

**Entra:**

- Envoltorio de `generateText` en `common-ai/back.ts`: cuenta, comprueba y corta.
- Contadores persistentes del core, por ventana diaria y mensual.
- Límites configurables en los **dos** ejes, con las tres unidades.
- Configuración en el diálogo de IA del core, junto a los providers y los LLM que ya se editan ahí.
- Excepción tipada, distinguible de un fallo del modelo.
- Visibilidad del consumo actual frente al tope.

**El coste SÍ entra**, y la razón por la que casi se queda fuera merece quedar escrita: se descartó
diciendo que «Kwirth no conoce las tarifas», y **era falso**. El diálogo de IA ya pide *Input cost / M
tokens* y *Output cost / M tokens* por cada LLM (`common-ai/src/front.tsx`), y **Agora ya calcula coste**
con ellos. Kwirth no mantiene una tabla de precios: los pone el admin, y ya están ahí.

🔴 **El coste se acumula AL ESCRIBIR**, nunca se deriva después de los tokens agregados: en el eje de la
clave conviven LLM con precios distintos, así que `tokens × precio` hay que hacerlo con el precio del LLM
que se acaba de usar. Es su propia columna.

**No entra:**

- Límites por usuario. El consumidor sellado por el core es `<tipo>:<id>`, no la persona.
- Cuotas del front: el front no llama a LLM.
- Reparto o colas cuando se agota: se corta, no se encola.

## El tope por canal es del CANAL

Decidido: del canal, no de la instancia. `excubitor` tiene **un** presupuesto, lo esté usando para un
clúster o para quince, y lo mismo Pinocchio con sus triggers. El sujeto del eje es el `consumerId` que el
core sella, `<tipo>:<id>`, sin más desglose.

⚠️ Lo que eso implica, y la guía debe decirlo: **un canal con mucho trabajo agota su cuota antes**, y el
tope no reparte entre instancias — la primera que llegue al límite lo agota para todas. Es la lectura
correcta de «tope del canal», pero conviene decirla antes de que alguien la descubra.
