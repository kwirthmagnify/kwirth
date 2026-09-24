# Kwirth Status — PRD

> **ESTADO — BORRADOR** (2026-09-24). Documento de PRODUCTO: qué se hace y por qué. El cómo va al PLAN,
> que cuelga de este. Nada de esto está construido todavía.

## El problema

Kwirth no sabe hablar de sí mismo.

Un administrador que opera un Kwirth con una docena de extensiones instaladas no tiene forma de contestar
a preguntas que se hace a diario:

- ¿Está todo levantado? ¿Desde cuándo no lo está?
- Este provider, ¿lo consume alguien, o lleva semanas emitiendo para nadie?
- Ese canal que va lento, ¿de qué depende?
- Si quito esta extensión, ¿a quién dejo sin servicio?
- ¿Qué se está llevando la memoria del pod?

Hoy las responde mirando el log del core, y el log del core es una lista de líneas, no un estado. Peor:
cuando una extensión no arranca, el síntoma que ve el usuario **no se parece al problema**. Un provider sin
router no se instancia y aparece como *"not running"* sin decir por qué; una extensión con `requiresRestart`
responde 404 en sus rutas y parece rota; un sender que se atasca no avisa. Todos esos casos están
diagnosticados uno a uno en los planes de este repositorio, y todos tienen la misma causa de fondo: **el
estado existe, pero no se puede mirar**.

Su monitorización externa no le sirve para esto. Prometheus sabe cuánta CPU consume el pod; no sabe qué
providers hay dentro, quién los consume ni si el que falta es el que sostiene tres canales abiertos.

## Para quién

**Para el administrador de Kwirth**: quien lo instala, lo configura y responde de que funcione.

**No para el desarrollador de extensiones.** Esa necesidad ya tiene producto: `provider-debug` enseña el
**contenido** de lo que emite un provider, en crudo, para depurarlo mientras se escribe. Kwirth Status
enseña la **topología y la salud**: qué hay, quién consume y si va bien. Son dos preguntas distintas y
conviven; ninguno sustituye al otro.

| | `provider-debug` | Kwirth Status |
|---|---|---|
| audiencia | quien **escribe** un provider | quien **opera** un Kwirth |
| enseña | el contenido, el payload | la topología y la salud |
| se abre | mientras se desarrolla | cuando algo va mal, o para vigilar |

## Qué es

**Una pantalla para echar un ojo.** Esa es la ambición, y conviene fijarla antes que la lista de
funcionalidades: se abre cuando quieres saber cómo está la cosa, se mira, y se cierra. No vigila, no
acumula historia, no despierta a nadie de madrugada.

Monitorizar Kwirth en profundidad es otro producto, y puede que llegue más adelante. Mezclar las dos
ambiciones aquí produciría un MVP que no acaba nunca y, sobre todo, una recolección permanente que
contradice el requisito de rendimiento.

Dentro de ese encuadre, responde tres preguntas, en este orden de importancia:

1. **¿Qué hay montado y cómo está?** El mapa de lo que Kwirth tiene dentro ahora mismo: providers,
   pluviders, senders, webhooks y canales, cada uno con su estado real — arrancado, parado, sin consumir.
2. **¿Quién depende de quién?** El diagrama del streaming: qué consume cada canal, cuántos suscriptores
   tiene cada provider, qué se queda huérfano si algo cae.
3. **¿Qué está costando?** Consumo atribuido **por componente**, que es lo que nadie más puede dar: qué
   canal, qué provider y qué sender se llevan el caudal.

## Qué NO es

- **No es un dashboard de infraestructura.** No compite con Prometheus ni con Grafana. Gráficas de CPU y
  memoria del pod ya las tiene el administrador, con más historia y mejores alertas. Lo que aquí se mide es
  lo que solo Kwirth sabe: el reparto **por componente**.
- **No enseña payloads.** El operador no tiene por qué ver el log ni los mensajes de nadie. Una pantalla de
  administración que muestre contenido es una fuga de datos con vistas bonitas. El contenido es de
  `provider-debug`, que se abre a propósito y con otro permiso.
- **No es una plataforma de monitorización.** No guarda serie temporal, no tiene alertas, no hay que
  configurarlo para que vigile. Enseña el **ahora**. Quien quiera historia y umbrales tiene su Prometheus
  para lo de fuera, y el día que haga falta lo de dentro, será otro producto.
- **No es un plugin más en la lista.** Es una vista privilegiada —ve todas las sesiones, todos los usuarios
  y toda la topología— y necesita su propio RBAC desde el primer día.

## Alcance de esta versión

**Mono-cluster, público, open source.** Vive en el repositorio de Kwirth y se publica como cualquier plugin
del core. **Decidido (2026-09-24):** id `status`, paquete `@kwirthmagnify/kwirth-status`, displayName
*Kwirth Status*. El id va corto porque es el que usan los demás del core —`log`, `ops`, `trivy`, `situs`,
ninguno lleva prefijo— y porque viaja en las URLs y en los scopes RBAC.

**Fuera de alcance de esta versión:**

- **La vista federada** de varios clústeres a la vez. Queda para después, y este MVP debe dejarla posible
  sin rehacerse: todo lo que se muestre tiene que poder llevar un cluster delante el día que haya más de uno.
- **Los avisos** (ver RF4): no es lo que se quiere de esta versión.
- **La serie temporal**: nada de historia ni de gráficas de evolución. Se enseña el ahora.

## Requisitos funcionales

### RF1 — Inventario con estado real

Lista de todo lo que Kwirth tiene montado: providers, pluviders, senders, webhooks y canales. De cada uno:
qué es, de dónde vino, si está arrancado y **desde cuándo**.

El estado tiene que distinguir los casos que hoy se confunden entre sí, porque es justo donde el
administrador se pierde:

| estado | qué significa |
|---|---|
| **activo** | instanciado y con consumidores |
| **ocioso** | instanciado y sin nadie escuchando |
| **no instanciado** | instalado pero nunca arrancado, y **por qué** (nadie lo consume, no declara router…) |
| **pendiente de reinicio** | instalado o actualizado, pero sus rutas no están montadas |
| **caído** | arrancó y falló, con el error y el momento |

Ese "por qué" es el corazón del requisito. Un *"not running"* a secas es lo que hay hoy, y no resuelve nada.

### RF2 — El mapa de dependencias

Representación visual de quién produce y quién consume: de cada provider, sus suscriptores; de cada canal,
sus fuentes. Y en los dos sentidos, porque las dos preguntas se hacen: *"¿de qué depende esto?"* y
*"¿a quién afecta si lo quito?"*.

Debe hacer evidente de un vistazo lo que hoy cuesta descubrir: un provider sin consumidores, un canal cuya
fuente está caída, una extensión pendiente de reinicio en medio de una cadena.

**El diagrama es del mismo tipo que los de Iter, y con la misma librería.** No hay que elegir nada ni añadir
dependencias: el core ya expone React Flow y el motor de layout como globales, y un plugin los consume
mapeándolos en su `build.mjs` igual que hace Iter —**0 KB de bundle propio**—:

| global del core | qué es | para qué aquí |
|---|---|---|
| `window.__kwirth__.reactFlow` | React Flow 12 | los nodos, las aristas, el zoom y el paneo |
| `window.__kwirth__.loadElk()` | elkjs, **carga diferida** | colocar el grafo solo, sin posiciones a mano |

El layout automático no es un lujo: la topología de un Kwirth **no la coloca nadie a mano**, cambia cada vez
que se instala algo. Y elkjs pesa ~1,4 MB, por eso el core lo sirve con `loadElk()` y webpack lo parte en su
propio *chunk*: no se descarga hasta que se calcula el primer diagrama. Quien nunca abra esta pantalla no
paga ese peso — lo mismo que pide el RNF1, pero en el lado del navegador.

La diferencia con Iter es **qué** se dibuja, no cómo: Iter mapea dependencias entre servicios del clúster;
aquí se mapea el interior de Kwirth. La familiaridad visual entre los dos es deseable, no casual.

### RF3 — Consumo por componente

**Decidido: solo contadores baratos.** Eventos entregados, bytes, suscriptores y errores, por provider, por
canal y por sender. Acumulados, y la tasa la calcula quien lee.

**Los contadores empiezan al abrir la pantalla**, porque antes no se estaba contando (RNF1). Es consecuencia
directa del requisito y hay que decirlo en la UI: lo que se ve es *"desde que abriste"*, no *"desde que
arrancó Kwirth"*. Para echar un ojo es justo lo que se quiere; quien necesite acumulados de días necesita
otro producto. Son enteros que se incrementan donde el dato
ya pasa: el coste es despreciable y no hay discusión posible con el RNF1.

Explícitamente **fuera**:

- **CPU por componente.** Node no la da, y obtenerla exigiría instrumentación con coste global (ver RNF1).
- **Memoria atribuida.** Es el dato que más pediría un administrador, pero en Node no hay forma exacta de
  repartirla entre componentes, y un número aproximado presentado como exacto es peor que no darlo. Si algún
  día se da, será con su margen de error escrito al lado.

### RF4 — Avisos ⏸️ APLAZADO

> **Fuera de esta versión (decidido 2026-09-24).** Se deja escrito para no volver a pensarlo desde cero.

La idea era que lo que un administrador necesita saber sin tener la pantalla abierta saliera por la
maquinaria de senders que ya existe: provider caído, componente que deja de recibir, extensión pendiente de
reinicio desde hace demasiado.

**Por qué se aparta:** avisar exige vigilar, y vigilar exige recolectar todo el rato, aunque nadie mire. Eso
choca de frente con el "pull, no push" del RNF1 y convierte una pantalla de consulta en un servicio que
corre siempre. Es una decisión de producto, no de esfuerzo: esta versión es para **echar un ojo**. La
vigilancia continua es otro producto y se decidirá aparte.

### RF5 — Permisos propios

Scopes RBAC propios del plugin, publicados en runtime como hacen los demás, y documentados en su guía de
administración. Ver el inventario completo, las sesiones y los consumos **no** puede ser el comportamiento
por defecto para cualquier usuario.

## Requisitos no funcionales

### RNF1 — No puede costar rendimiento 🔴

Requisito **dominante**: si hay conflicto entre enseñar un dato y el coste de recogerlo, gana el coste.
Kwirth está en el camino del log de sus usuarios, y una herramienta de vigilancia que ralentiza lo vigilado
no es una herramienta, es un problema nuevo.

**El requisito, dicho con precisión (decidido 2026-09-24):** el coste tiene que ser **cero cuando nadie está
mirando**. Mientras alguien tiene la pantalla abierta, el coste de medir no preocupa — está mirando porque
quiere saber, y el precio de saberlo lo paga él, no el resto del sistema.

Eso simplifica el producto: **no hay interruptor**. La instrumentación no la enciende un ajuste, la enciende
el propio ciclo de vida del canal — se activa cuando el primero abre la pantalla y se apaga cuando el último
la cierra.

**Reglas de diseño, no aspiraciones:**

- **Pull, no push.** Con el canal cerrado no se ejecuta nada: ni temporizadores, ni recolección, ni envíos.
  La topología ya está en memoria (`ClusterInfo.providers`, `pluviders`, `senders`, `webhooks`) y se lee
  cuando alguien pregunta.
- **Cero es cero, no "poquísimo".** Con el canal cerrado, el camino caliente tiene que ejecutar **las mismas
  instrucciones que ejecutaría si este plugin no existiera**. En particular, nada de `if (contando) n++` por
  evento: un `if` cuesta poco, pero cuesta, y se paga en cada línea de log que pasa por Kwirth. La forma de
  que sea cero es **no preguntar nada**: al encender se sustituye la implementación, una vez, y el camino
  apagado se queda intacto.
- **Mientras se mira, sentido común.** Contadores enteros y sin asignaciones por evento — no por el requisito,
  que ya está cubierto, sino porque generar basura por evento en Node se nota en el GC de todo el proceso.
- **Las tasas las calcula quien lee.** Se guardan acumulados; el lector resta dos muestras. El productor no
  sabe nada de ventanas, medias ni historial.
- **El front refresca solo con el tab abierto y visible.** Un grafo repintándose en segundo plano es coste
  que no se ve venir.

**Prohibido**, por coste conocido: `async_hooks` / `AsyncLocalStorage` para atribuir CPU; proxies o wrappers
de instrumentación sobre llamadas existentes; histogramas de latencia por evento; leer `/proc` en bucle
dentro del proceso de Kwirth.

**Criterios de aceptación medibles.** Al desaparecer el techo porcentual, lo que queda es **determinista**,
que es mucho mejor test: no depende de lo cargada que esté la máquina y da el mismo resultado siempre.

| medida | criterio |
|---|---|
| camino caliente con el canal **cerrado** | **idéntico** al de un Kwirth sin este plugin: ni una instrucción más |
| memoria en reposo con el canal cerrado | **cero** bytes atribuibles al plugin |
| asignaciones por evento con el canal **abierto** | **ninguna**: nada que crezca con el número de eventos |
| tiempo de arranque del core | sin diferencia medible |

⚠️ Se descartó a propósito un techo del tipo *"≤ 5 % de caída de throughput"*: medir caudal en Node varía más
de un 10 % entre corridas del **mismo** código, así que un test así no detecta regresiones, echa una moneda
al aire — y un test que falla al azar se acaba ignorando. Lo de arriba se verifica contando, no cronometrando.

### RNF2 — Un provider que no colabore no puede romper la pantalla

La información la dan las extensiones, y muchas no la darán: las ya publicadas, las de terceros, las
antiguas. El que no informe aparece como **"no informa"**, no como un hueco, un cero ni un error. Un cero
donde debería poner "no lo sé" es peor que no enseñar nada.

## Lo que hay que añadir al core

Hoy esto **no se puede construir**. `IProvider` permite meter y quitar suscriptores, y expone `started`,
pero no se le puede preguntar a un provider qué tiene dentro: cada uno guarda los suyos en un `Map` privado.

Hace falta un método **opcional** en el contrato, con el mismo patrón que `exportConfig`/`importConfig` de
`IExtension`: quien no lo implemente sale como "no informa", y la adopción es incremental sin bump masivo.
Por contrato debe ser **barato**: devuelve contadores ya calculados, no computa nada.

**Reparto, y conviene dejarlo escrito antes de empezar:** el contrato va al **core**, que es público, y lo
implementan los providers open source. Si el contrato acabara en el lado equivocado, ningún provider público
lo implementaría nunca.

## Decisiones abiertas

Ninguna.

### Cerradas el 2026-09-24

| decisión | resuelta |
|---|---|
| id del plugin | `status` (paquete `@kwirthmagnify/kwirth-status`) |
| avisos por sender (RF4) | fuera: esto es para echar un ojo, no para vigilar |
| alcance del consumo (RF3) | solo contadores baratos; sin memoria atribuida |
| techo de rendimiento | fuera el 5 % de throughput. El requisito es **coste cero con el canal cerrado**; con alguien mirando, no preocupa. Sin interruptor: lo enciende el ciclo de vida del canal |

## Criterios de aceptación

1. Un administrador ve, en una pantalla, todo lo que Kwirth tiene montado y el estado de cada cosa.
2. Cada estado anómalo dice **por qué** lo es, no solo que lo es.
3. El mapa responde a *"¿a quién afecta si quito esto?"* sin leer configuración a mano.
4. Un provider que no implementa el contrato nuevo aparece como "no informa" y no rompe nada.
5. **Con el canal cerrado, Kwirth no hace absolutamente nada por culpa de este plugin.**
6. **El test de rendimiento pasa**, y falla si alguien cruza el techo dentro de seis meses.
