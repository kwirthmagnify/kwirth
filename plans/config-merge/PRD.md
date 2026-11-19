# Mezclar ficheros de configuración — PRD

> **ESTADO — PRD, sin código.** Qué se quiere y por qué; el desglose técnico irá a `PLAN.md` cuando esto
> se valide. Abierto el 2026-11-19. Cuelga de la portabilidad de configuración
> ([config-portability](../config-portability/PRD.md)), que da el formato del fichero (`IConfigBundle`).

## El problema

*Kwirth export* saca la configuración de **un** Kwirth en un fichero, y *Kwirth import* la mete en
otro. Pero hay casos en los que lo que hace falta no está en un solo fichero:

- **Juntar dos Kwirths en uno**: los marketplaces de uno, los modelos de IA del otro, las extensiones
  de los dos.
- **Preparar una configuración "de referencia"** a partir de varios exports (el de dev, el de un
  cliente, el de un laboratorio) para instalarla después en Kwirths nuevos.
- **Completar la configuración actual** con lo que trae un fichero, sin perder lo que ya hay.

Hoy eso se hace editando JSON a mano, que es justo lo que el formato quería evitar: es fácil romperlo,
y las entradas de las extensiones son opacas.

## Qué se quiere

Una pestaña nueva, **Portability**, en *Kwirth settings*. Su única función, de momento, es **mezclar
ficheros de configuración** y descargar el resultado:

1. El usuario **sube uno o varios ficheros** de *Kwirth export*.
2. Puede **añadir la configuración actual** de este Kwirth como una fuente más, con la misma casilla
   *Include credentials* que el export (desmarcada por defecto).
3. La mezcla es **automática**: todo lo que está en una sola fuente, o igual en todas las que lo traen,
   entra sin preguntar. **Solo se pregunta por lo que es diferente.**
4. Cuando ha respondido a todas las diferencias, **descarga un fichero nuevo** con la mezcla, en el
   formato actual (2).

**No importa nada**: el resultado se descarga, y aplicarlo es cosa de *Kwirth import*, que ya existe,
con su vista previa y sus comprobaciones. Mezclar no toca este Kwirth.

## Cómo se mezcla

### Las fuentes

Cada fuente dice qué es (nombre del fichero o *This Kwirth*), cuándo se exportó, de qué versión de
Kwirth viene, si **lleva credenciales** y cuántas entradas trae. Se puede quitar cualquiera.

### Automático: solo se pregunta por lo diferente

Cada elemento (un marketplace, un modelo de IA, una extensión, un valor suelto…) cae en uno de tres casos:

| caso | qué pasa |
|---|---|
| está en **una sola** fuente | entra tal cual, sin preguntar |
| está en varias y es **idéntico** en todas | entra una vez, sin preguntar |
| está en varias y **difiere** | es una **diferencia**: se pregunta de qué fuente se coge |

"Idéntico" es el contenido completo, campo a campo, no solo el identificador: dos marketplaces con el
mismo `id` y distinta URL son una diferencia.

Las diferencias quedan **pendientes** hasta que el usuario elige en cada una, viendo los valores de cada
fuente lado a lado. Para no ir una a una cuando son muchas, hay un atajo: **"coger todas las pendientes
de la fuente X"**, que se puede ajustar después en cualquiera. Mientras quede alguna pendiente, el fichero
no se puede descargar: lo que difiere lo decide el usuario, nunca un orden implícito.

### La parte del core: se mezcla por dentro

`core.settings` y `core.sharedAi` las entiende el core, así que se mezclan **elemento a elemento**:

| qué | cómo se identifica | regla |
|---|---|---|
| marketplaces | `id` | se unen; un `id` en varias fuentes con contenido distinto es una diferencia |
| package registries | `id` | igual |
| login IP filter: allowed / trusted proxies | `address` | igual; el interruptor `enabled` es un valor suelto |
| log: niveles por componente | la clave del componente | igual |
| proveedores de IA | `name` | igual |
| modelos de IA | `id` | igual |
| valores sueltos (intervalo de métricas, líneas del log previo, senders de avisos…) | el nombre del campo | si difiere entre fuentes, es una diferencia |

Un modelo de IA apunta a un proveedor por su nombre. Si el resultado deja un modelo cuyo proveedor no
viene en ninguna fuente, se **avisa** en el informe (no se borra: puede existir en el Kwirth de destino).

### Las extensiones: se coge la entrada entera

Cada extensión (`type/id`) es una entrada **opaca**: solo la extensión entiende su `coreConfig` y su
`config`. Por eso no se mezcla por dentro: se coge **entera** de una fuente. Si dos fuentes la traen
idéntica, entra sin preguntar; si difiere, es una diferencia y se pregunta de cuál se coge. Como el
contenido es opaco, la pregunta enseña lo que se sabe de cada lado (versión, marketplace, fecha del
export de esa fuente) y, plegado, el JSON de cada una.

Si las versiones de esa extensión difieren entre fuentes, se dice en la fila (no se transforma nada,
igual que hace el import con `VERSION_DIFFERS`).

### El fichero resultante

- Formato **2**. Los ficheros en formato 1 se leen con la misma normalización que usa el import, así
  que nunca se mezclan las dos formas.
- `meta.exportedAt`: el momento de la mezcla. `meta.kwirthVersion`: la de este Kwirth.
- `meta.source`: que diga que es una mezcla y de qué fuentes (sus nombres), para saber de dónde salió al
  abrirlo meses después.
- `meta.includesCredentials`: **verdadero si alguna fuente que aporta algo lleva credenciales**. Un
  fichero mezclado no puede declarar que no lleva secretos si alguna de sus partes los lleva.

## Reglas que no se negocian

- **Un fichero que no es de Kwirth, o de un formato que no se sabe leer, se rechaza al subirlo**, con el
  motivo, y no entra en la lista. Las mismas comprobaciones que el import.
- **No se inventan datos**: lo que no está en ninguna fuente no aparece en el resultado.
- **Mezclar no aplica nada** en este Kwirth: ni la configuración actual se toca al añadirla como fuente.
- Las credenciales siguen la misma regla que el export: la fuente *This Kwirth* las lleva solo si se
  marca *Include credentials*, y el resultado declara si las lleva.

## Interfaz

La pestaña sigue las reglas de los diálogos del proyecto: contenido de tamaño fijo, nada que aparezca o
desaparezca (lo que no aplica, deshabilitado), columnas de ancho fijo y tablas ordenables.

1. **Fuentes**: la lista, con *Add file* y *Add this Kwirth's configuration* (+ *Include credentials*).
2. **Diferencias**: una tabla con una fila por cada elemento que difiere: dónde está, el valor de cada
   fuente lado a lado y un selector para elegir. Arriba, cuántas hay y cuántas quedan pendientes, y el
   atajo "coger todas las pendientes de la fuente X". Lo que entra sin preguntar se ve en un resumen
   (cuántos elementos y de qué tipo), para saber qué lleva el fichero sin tener que revisarlo.
3. **Download merged file**: deshabilitado mientras no haya fuentes o quede alguna diferencia pendiente.

## Fuera de alcance (por ahora)

- Mezclar por dentro la configuración de una extensión: es opaca y solo ella la entiende.
- Editar valores a mano en la pestaña: se elige de qué fuente viene cada cosa, no se escribe.
- Importar desde la propia pestaña: para eso está *Kwirth import*.

## Decisiones tomadas

| # | decisión | elegido |
|---|---|---|
| D1 | La parte del core | Se mezcla elemento a elemento, por su identificador (2026-11-19) |
| D2 | Conflictos | Automático: lo que está en una sola fuente o es idéntico entra solo; **solo se pregunta por lo que difiere**, y no se descarga hasta responder todo. Atajo "coger todas las pendientes de la fuente X". Sustituye al "gana la última" de la primera versión (2026-11-19) |
| D3 | Dónde vive | Pestaña *Portability* de *Kwirth settings*; solo mezcla y descarga (2026-11-19) |

## Abierto

- ¿Dónde se hace la mezcla, en el back (reutiliza la lectura de formato 1 y las validaciones del import)
  o en el front? Propuesta del PLAN: **en el back**, un endpoint que recibe las fuentes y las elecciones
  y devuelve el fichero y el informe, para que haya una sola implementación del formato.
