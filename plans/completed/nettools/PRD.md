# nettools — DCE de herramientas de red — PRD

> Estado: **VIVO** (2026-09-29). Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en streams va al [PLAN](./PLAN.md). Si algo de aquí contradice lo que ves en el
> producto, gana el producto.

## 1. El problema

Varias extensiones necesitan responder a la misma pregunta de fontanería: **¿esto está vivo y
resuelve?**. Un provider que sondea un endpoint, un canal que diagnostica por qué un servicio no
contesta, un plugin que valida la configuración que acaba de teclear el usuario. Hoy cada una se lo
resuelve por su cuenta, y eso significa:

1. **N implementaciones** del mismo `net.createConnection` con su `setTimeout`, cada una con sus
   propios bugs de temporización.
2. **N formas distintas de contar el resultado**: una devuelve `boolean`, otra el error de Node en
   crudo, otra un `string`. Nada se puede pintar igual en dos sitios.
3. Y la pregunta que ninguna contesta bien: lo que hay que comprobar es lo que ve **Kwirth desde
   dentro del clúster**, no lo que ve el navegador de quien opera. `kwirth-postgres.default.svc` no
   significa nada en un portátil.

Es exactamente el caso que el tipo [`dce`](../completed/dce/PRD.md) existe para cubrir: código que
varias extensiones necesitan, que no produce datos ni pantallas, y que no pertenece al core.

## 2. Objetivo

**Una DCE del core, open source y solo de back, que ofrezca dos primitivas de red con una forma de
resultado única: alcanzabilidad TCP y resolución DNS (directa e inversa).** Y un **plugin** que la
consume, para que se pueda ver funcionando y para que quien escriba un consumidor tenga de dónde
copiar.

### No objetivos

- **No es un provider.** No emite, no tiene suscriptores y no tiene ciclo de vida propio: se le
  pregunta y contesta. Si algo tuviera que emitir latencias periódicamente, eso sería un provider que
  *consume* esta DCE.
- **La DCE no tiene front.** No hay nada que pintar: lo pinta quien la consume. Solo `back.js`.
- **No tiene configuración.** Como toda DCE en V1 (PRD del tipo, D3): ni diálogo, ni `configRouter`,
  ni secretos.
- 🔴 **No lanza procesos.** Ni `ping`, ni `dig`, ni `nslookup`. Ver §4.
- **No es un escáner.** Ni barridos de rangos, ni descubrimiento, ni puertos en masa: una llamada,
  un destino. Lo contrario convertiría una utilidad en una herramienta ofensiva instalable.
- **No traceroute, ni whois, ni HTTP.** Para HTTP ya está el provider `http-pull-push`.

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien escribe un **provider** que sondea un host | Saber si el destino está alcanzable antes de montar el cliente, y decirlo igual que los demás |
| CU2 | Quien **opera** y algo no conecta | Resolver un nombre y probar un puerto **desde donde corre Kwirth**, sin entrar en un pod |
| CU3 | Quien **valida configuración** recién tecleada | Comprobar que el host que ha puesto el usuario resuelve, antes de guardar |
| CU4 | Quien **escribe un consumidor de una DCE** | Un ejemplo completo y honesto de cómo se declara, se pide y se pinta |

## 4. Concepto

```
   +---------------------------------------------+
   |  DCE  nettools   (solo back)                |
   |                                             |
   |   ping(target, options)    -> IPingResult   |
   |   resolve(name, options)   -> IDnsResult    |
   |   reverse(ip, options)     -> IReverseResult|
   +----------------------+----------------------+
                          | create(host)  (una vez)
                          v
              global.__kwirth_dce__['nettools']
                          ^
                          | getDce<INetTools>('nettools')
            +-------------+-------------+
            |                           |
     plugin nettools             cualquier otra
     (canal con front)            extensión
```

### 🔴 Nada de binarios del sistema

La primera versión hacía ICMP lanzando el `ping` del sistema y leyendo su salida. **Se retiró**
(decisión del usuario, 2026-09-29), y las razones son las que hacían frágil todo ese camino:

- **Kwirth corre en un contenedor.** En `node:24-alpine` el `ping` es el de busybox y, sin
  `CAP_NET_RAW`, no envía nada. Y hay clústeres donde el ICMP saliente está cortado por política de
  red.
- **La salida cambia en cada implementación** —busybox, iputils, macOS, Windows— y **traducida cambia
  hasta las palabras**. Había un parser con fixtures de las cuatro para que el código de salida y el
  `time=` significaran lo mismo en todas. Era código correcto resolviendo un problema que no hacía
  falta tener.
- **Un destino que empieza por `-`** se lo comía el binario como flag, así que hacía falta validar
  antes de ejecutar. Sin proceso, ese riesgo desaparece.

Lo que queda **solo usa Node**: `node:net` y `node:dns/promises`. Ni una dependencia, ni un proceso.

### ping es TCP

`ping()` conecta a un puerto, cronometra hasta el `connect` y cierra. **No escribe nada**: la pregunta
es si el puerto contesta, y escribirle sería otra pregunta.

Dentro de un clúster es además la pregunta más útil: lo que tiene que estar levantado es un
**servicio**, no un host. Un nodo que responde ICMP con el Postgres caído no sirve de nada.

El tiempo incluye resolver el nombre, que es lo que de verdad espera quien intenta llegar a un
servicio.

### La forma del resultado

Ni excepciones ni `boolean`. Las tres funciones devuelven un objeto con la misma idea:

- **Lo que falla por intento** va en `attempts[]`, con su `error`.
- **Lo que falla entero** (el destino no era un destino) va en `error` del resultado, y el resto del
  objeto queda coherente: `received: 0`, `lossPercent: 100`.

Así el consumidor pinta siempre lo mismo, y nunca tiene que envolver la llamada en un `try`. Es lo
contrario de `getDce()`, que **sí** lanza — y a propósito: que la DCE no esté es un error de
instalación, que un host no conteste es un dato. El plugin consumidor pinta las dos cosas **distinto**,
que es la prueba de que la distinción sirve para algo.

### El plugin consumidor

Un canal `nettools` con un nombre, un tipo de registro y un puerto, y tres botones: **Resolve**,
**Reverse** y **Check port**. Todo lo contesta el **back**, con la instancia compartida.

Vive dentro de la carpeta de la DCE (`dces/nettools/consumer`), como el stub del `sample`, y **no se
publica**: es a la vez el banco de pruebas del QA y el ejemplo de cómo se escribe un consumidor.

## 5. Requisitos

### Funcionales

| # | Requisito |
|---|---|
| RF1 | `ping(target, options?)`: `port` (por defecto 443), `count` intentos (4) y `timeoutMs` por intento (2000). Devuelve intento a intento más `sent`, `received`, `lossPercent`, `minMs`, `avgMs`, `maxMs` |
| RF2 | El sondeo es un `connect` TCP. **No se escribe nada** en el puerto, y se cierra en cuanto se sabe la respuesta |
| RF3 | Informa de la **dirección resuelta** (`address`) cuando la conexión llegó a conocerla |
| RF4 | 🔴 **No se lanza ningún proceso**, en ninguna ruta de código. Solo `node:net` y `node:dns/promises` |
| RF5 | `resolve(name, options?)`: tipo de registro (`A` por defecto), servidores DNS propios opcionales y timeout. Devuelve los registros **normalizados a texto**, iguales para todos los tipos, más `timeMs` |
| RF6 | `reverse(ip, options?)`: PTR de una IP, con las mismas opciones. Devuelve `hostnames[]` |
| RF7 | El destino se **valida** antes de abrir nada. Inválido = `error` en el resultado, sin socket ni consulta. El valor está en el **mensaje**: decir que `https://example.com` no es un nombre de host es más útil que un `EBADNAME` del resolutor |
| RF8 | Ningún fallo de red lanza: viaja en `error`. Las opciones imposibles no lanzan tampoco: se normalizan |
| RF9 | La DCE es **solo back**: el paquete no trae `front.js` |
| RF10 | Un **plugin consumidor** con front declara `requiresExtension: ["dce:nettools:0.1.0"]`, pide la instancia con `getDce()` en el back y pinta los tres resultados, distinguiendo un fallo **dentro** del resultado de la DCE ausente |

### No funcionales

| # | Requisito |
|---|---|
| RNF1 | Cero dependencias en runtime fuera de Node. Nada que bundlear |
| RNF2 | El consumidor **no bundlea** la DCE: la resuelve contra el registro en su `build.mjs`. Una copia bundleada construye su propio objeto y la instancia única se duplica sin que nada falle |
| RNF3 | `requiresRestart: true` en la DCE, como en todas (PRD del tipo, RNF3) |
| RNF4 | Todo el código, logs, UI y comentarios en inglés |
| RNF5 | La lógica que merece test —normalización de opciones, estadísticas, normalización de registros DNS, la guarda del destino— es **pura** y se prueba sin red |

## 6. Riesgos

| # | Riesgo | Cómo se trata |
|---|---|---|
| R1 | Un consumidor la usa para barrer la red | Fuera de objetivo: un destino por llamada. El control real es quién puede instalar extensiones |
| R2 | `count` desmedido bloquea el proceso durante minutos | Se acota: `count` entre 1 y 10, `timeoutMs` entre 100 y 30000, normalizado sin lanzar |
| R3 | El consumidor bundlea la DCE por error y hay dos instancias sin que nadie lo note | RNF2: el `build.mjs` del plugin mapea el paquete al registro, y el mapeo está escrito y comentado esperando a que la DCE se publique |
| R4 | Un `connect` que se queda colgado deja el socket abierto | El socket se destruye en la primera de las tres salidas (`connect`, `timeout`, `error`), y una bandera impide resolver dos veces |
| R5 | Un TCP ping a un puerto equivocado parece "el host está caído" | El resultado lleva **el puerto** y la dirección, y el plugin los pinta en la cabecera de cada respuesta |

## 7. Decisiones cerradas

| # | Decisión | Quién, cuándo |
|---|---|---|
| D1 | La DCE es solo back, sin front y sin configuración | usuario, 2026-09-29 |
| D2 | 🔴 **Fuera el ICMP y el binario del sistema**: `ping()` es TCP y no se lanza ningún proceso. Kwirth son contenedores, y depender de lo que traiga la imagen —y de cómo lo imprima— no es una dependencia que valga la pena | usuario, 2026-09-29 |
| D3 | Los errores de red viajan en el resultado; no se lanza | 2026-09-29 |
| D4 | Los registros DNS se normalizan a `string[]` para todos los tipos (`MX` da `"10 mail.example.com"`, y un NULL MX da `"0 ."`) | 2026-09-29 |
| D5 | Hay un **plugin consumidor** con front, en la carpeta de la DCE y sin publicar, como el stub del `sample`. Es el QA manual y el ejemplo a la vez | usuario, 2026-09-29 |

## 8. Qué NO entra, y dónde queda anotado

Al backlog del PLAN:

- **traceroute** y **whois**.
- Registros DNS **estructurados** además del texto (`{ priority, exchange }` para `MX`).
- **DoH/DoT** (DNS sobre HTTPS/TLS).
- Ping **en paralelo** y el `intervalMs` entre intentos.
- Promover el plugin consumidor a un artefacto **publicable** en `plugins/`.
