# nettools — DCE de herramientas de red — PLAN

> Estado: **CERRADO** (2026-09-29). QA validado por el usuario, ambas extensiones publicadas en npm
> público y en el marketplace público. El [PRD](./PRD.md) dice qué y por qué; esto dice en qué orden y
> con qué se da por hecho. Append-only.

## S1 — la DCE `nettools`

**Alcance**: scaffold, contrato, implementación de los tres métodos, harness y e2e de API.

| # | tarea | estado |
|---|---|---|
| S1.1 | Scaffold con `node tools/create-kwirth-dce.mjs --id nettools --sides back` | ✅ |
| S1.2 | El contrato en `src/common/NetTools.ts`: `EDnsRecordType`, `INetTools` y los tres resultados | ✅ |
| S1.3 | La guarda del destino en `src/back/target.ts` | ✅ |
| S1.4 | Los sondeos reales en `src/back/probes.ts`: `net.createConnection` y `dns.promises.Resolver` | ✅ |
| S1.5 | La orquestación en `src/back/NetToolsImpl.ts`: normalización de opciones, estadísticas, forma del error | ✅ |
| S1.6 | La fábrica en `src/back/index.ts` | ✅ |
| S1.7 | Harness (`npm test` de la DCE): **40 ✅ / 0 ❌** en cinco ficheros | ✅ |
| S1.8 | Cableado de desarrollo: `back/kwirth-dev.json` → `dces.nettools` | ✅ |
| S1.9 | `npm run try`: banco de pruebas contra la red real, sobre el bundle de `dist/` | ✅ |
| S1.10 | E2E de API `front/e2e/tests/dce-nettools.spec.ts`: **4 ✅** | ✅ |

### 🔴 El ICMP se entregó y se retiró el mismo día

La primera versión hacía ICMP lanzando el `ping` del sistema, un proceso por intento, con un parser de
la salida y fixtures de busybox, iputils, macOS y Windows —también traducido—. Funcionaba, y tenía 21
tests. **Se borró entero** a petición del usuario (PRD D2): Kwirth son contenedores, y depender de que
la imagen traiga el binario, de que tenga `CAP_NET_RAW` y de cómo imprima los milisegundos es una
dependencia que no compensa.

Lo que se fue con él: `src/back/pingOutput.ts` y su test, `EPingMode`, el campo `mode` del resultado,
la noción de intento **fatal** (nada lo es ya: un puerto que no contesta es un intento fallido y basta)
y el `logger` del objeto, que solo servía para avisar de un fallo fatal. Lo que **se quedó** es la
guarda del destino, con otra justificación: ya no protege de un flag que se cuela en un binario, sino
que da un mensaje decente cuando alguien teclea una URL en un campo que pide un host.

### Cómo quedó repartido el código

```
dces/nettools/
  src/common/NetTools.ts     el contrato: opciones y resultados. Lo que importa un consumidor
  src/back/target.ts         puro: isValidTarget()
  src/back/dnsFormat.ts      puro: cada tipo de registro a su forma canónica de zona
  src/back/probes.ts         lo que toca la red: socket y resolver. Sustituible en test
  src/back/NetToolsImpl.ts   la orquestación, parametrizada por los sondeos. Sin red en los tests
  src/back/index.ts          IDceBack: create(host) una vez
  try.mjs                    el banco de pruebas manual, sobre dist/
```

El corte está donde está por RNF5: `NetToolsImpl` recibe los sondeos como parámetro, así que el harness
prueba las estadísticas, la pérdida y la forma del error **sin abrir un socket**. Lo que sí toca la red
es `probes.ts`, y de eso se prueba lo que se puede hacer en local: TCP contra un servidor de loopback
propio y contra un puerto cerrado.

### Decisiones que aparecieron al implementar

| # | decisión |
|---|---|
| I1 | `attempts[]` se devuelve siempre, también cuando el sondeo no llega a empezar. Un array vacío obligaría al consumidor a distinguir dos casos para pintar lo mismo |
| I2 | El tiempo de un intento lo medimos nosotros alrededor del `connect`, e **incluye resolver el nombre**: es lo que de verdad espera quien intenta llegar a un servicio |
| I3 | `resolve()` con `server` construye un `Resolver` nuevo por llamada. Cachearlo por juego de servidores es optimización prematura para tres métodos que hacen E/S de todas formas |
| I4 | El timeout del `Resolver` de Node es por **intento**, y hace 4 por defecto. Se fija `tries: 1` para que `timeoutMs` signifique lo que dice |
| I5 | Hay un `npm run try` (`try.mjs`) que carga **el bundle de `dist/`** con un host en memoria. Cargar el bundle, y no las fuentes, es justo lo que se quiere comprobar |
| I6 | `MX` de un dominio que no recibe correo (NULL MX, RFC 7505) salía como `"0 "`, con un espacio colgando, porque Node devuelve el exchange vacío. Lo destapó el `try` contra `example.com`, que es exactamente eso. Sale `0 .`, la forma canónica de zona |

## S2 — el plugin consumidor

**Alcance**: un canal con front que consume la DCE, como banco de pruebas del QA y como ejemplo.

| # | tarea | estado |
|---|---|---|
| S2.1 | El plugin, calcado del stub del `sample`: `build.mjs`, `watch.mjs`, `tsconfig`. Nació en `dces/nettools/consumer/` y **se mudó a `plugins/nettools/` en S3**, al decidirse que se publica | ✅ |
| S2.2 | El contrato local en `src/common/NetToolsContract.ts` y los mensajes en `NetToolsMessages.ts` | ✅ |
| S2.3 | El canal del back: `getDce()`, los tres comandos, el resultado **sin tocar** de vuelta | ✅ |
| S2.4 | El front: canal, icono y la pestaña con el formulario y las respuestas | ✅ |
| S2.5 | Cableado: `back/kwirth-dev.json` → `plugins.nettools` | ✅ |
| S2.6 | E2E `front/e2e/tests/nettools-channel.spec.ts`: **7 ✅** | ✅ |
| S2.7 | Histórico de métricas + los dos PNG | ✅ |
| S2.8 | QA manual | ✅ validado por el usuario |

### Decisiones y sustos de S2

| # | decisión |
|---|---|
| C1 | 🔴 **El campo del tipo de registro no se puede llamar `type`**. Un comando viaja **sobre** un `IInstanceMessage`, que ya tiene su propio `type` (`EInstanceMessageType`), y TypeScript reduce la intersección de los dos a `never`: seis errores que no mencionan la causa. Se llama `recordType` |
| C2 | El back devuelve el resultado de la DCE **entero y sin aplanar**. Convertirlo a texto allí escondería justo lo que hay que mirar, y además cada consumidor tendría su propio formato |
| C3 | Un fallo **dentro** del resultado (un puerto que rechaza, un nombre que no resuelve) y **la DCE ausente** se pintan distinto y con `aria-label` distintos. Es la distinción que justifica que `getDce()` lance y que lo demás no |
| C4 | El icono es un `SvgIcon`, nunca un carácter en un `<span>`: el selector de canales construye cada opción con icono más nombre, y un icono con TEXTO se convierte en el nombre accesible. Ya mordió con el stub del `sample`, que salía en la lista como `◎` |
| C5 | El plugin **no importa el paquete de la DCE**: declara su contrato local. Empezó siendo por necesidad —la DCE no estaba publicada— y en S3 resultó ser lo **correcto**, por un motivo de peso (S3, P1) |
| C6 | `sources: [EClusterType.KUBERNETES]`, como el stub del `sample`. `EClusterType` solo tiene `KUBERNETES` y `NONE`; que el canal deba ofrecerse también sin Kubernetes es plausible y **no está comprobado**, así que va al backlog en vez de adivinarse |
| C7 | Al abrir la pestaña **no se consulta nada**. Resolver algo que nadie ha tecleado sería hacer red desde el clúster porque alguien abrió una pestaña |
| C8 | Los `aria-label` de los inputs se quitaron: con un `label` de MUI **y** un `aria-label`, gana el segundo como nombre accesible, y el campo dejaba de encontrarse por su etiqueta visible |

## S3 — publicación

**Alcance**: convertir el consumidor en un artefacto publicable y sacar las dos extensiones al repo
público y a npm.

| # | tarea | estado |
|---|---|---|
| S3.1 | El consumidor se muda de `dces/nettools/consumer/` a `plugins/nettools/`, deja de ser `private` y pasa a describirse por lo que hace | ✅ |
| S3.2 | Su `build.mjs` copia el `README.md` al tarball y escribe `homepage`, `repository` y `keywords` | ✅ |
| S3.3 | Lo mismo en el `build.mjs` de la DCE | ✅ |
| S3.4 | READMEs reescritos como páginas de paquete npm, con enlace a Kwirth | ✅ |
| S3.5 | Verificación del tarball: los dos llevan `README.md` dentro | ✅ |
| S3.6 | `npm publish --access public` de la DCE y del plugin, en ese orden | ✅ `0.1.0` |
| S3.7 | Fila en `dces/manifest.json` y en `plugins/manifest.json` | ✅ |
| S3.8 | Guía: página de la DCE, página y referencia del plugin, tres entradas de sidebar, tres índices, y el tgz de la guía regenerado | ✅ |
| S3.9 | Captura `manage-dces.png` regenerada, **solo esa** (`CAPTURE_ONLY=dces`) | ✅ |

### Lo que se aprendió al publicar

| # | hallazgo |
|---|---|
| P1 | 🔴 **El mapeo `DCE_PACKAGES` devuelve la INSTANCIA, no el módulo.** Todo lo que el contrato exporte y no forme parte del objeto —un **enum** como `EDnsRecordType`, una constante, una función auxiliar— desaparece: el consumidor recibe `undefined` en runtime y **nada falla al construir**. Por eso el plugin declara el contrato local y solo pide el objeto al registro, y por eso no se cambió a importar el paquete tras publicarlo. Anotado en la guía del tipo `dce`, que es donde lo va a leer el siguiente |
| P2 | El movimiento de carpeta no cambió **un byte** de `dist/back.js` ni de `dist/front.js` (comparados por hash antes y después), así que el QA ya validado sigue valiendo. Era la condición para tocar algo después del gate |
| P3 | `npm view` daba 404 para los dos paquetes minutos después de publicarlos, pero la **URL del tarball** —que es la que lleva el manifest y la que usa Kwirth— respondía 200. Es la caché de metadatos del registro, no un publish fallido: se comprueba la URL, no el `view` |
| P4 | 🔴 **Lección de método, no de producto**: este bloque se intentó insertar con un script de node embebido en bash, y bash se comió todos los backticks —dejó media tabla vacía y una celda con la salida de un `npm view` ejecutado por accidente—. Es exactamente lo que dice la regla de editar con el editor y no con scripts. Se rehízo a mano |


## Backlog

Append-only. Nada de esto está empezado.

| # | qué | por qué no ahora |
|---|---|---|
| B1 | Registros DNS **estructurados** además del texto (`{ priority, exchange }` para `MX`) | Nadie los ha pedido; el texto se parsea si hace falta |
| B2 | **traceroute** | Sin lanzar procesos habría que hablar UDP/ICMP a mano, que es justo lo que D2 descarta |
| B3 | **whois** | Necesitaría una dependencia o hablar TCP/43 a mano, y no es red del clúster |
| B4 | **DoH/DoT** | Solo tiene sentido con configuración, que la V1 de las DCE no tiene |
| B5 | Ping **en paralelo** e `intervalMs` entre intentos | La versión secuencial es la que se parece a `ping`; el paralelo distorsiona la latencia |
| B6 | El canal disponible también **sin Kubernetes** (`EClusterType.NONE` en `sources`) | Plausible y sin comprobar: hace falta un Kwirth arrancado sin clúster para verlo (C6) |
| ~~B7~~ | ~~Promover el consumidor a un plugin publicable en `plugins/nettools`~~ | **HECHO en S3** |
| ~~B8~~ | ~~Publicar la DCE en npm y su fila en `dces/manifest.json`~~ | **HECHO en S3.** Y la parte de «el consumidor puede tirar su copia local del contrato» resultó ser **falsa**: el mapeo no deja sobrevivir a los enums (S3, P1) |
| B9 | Que el mapeo `DCE_PACKAGES` conserve los **exports que no son la instancia** del módulo de contrato | Es del **core**, no de esta DCE: hoy el `build.mjs` de un consumidor sustituye el módulo entero por el objeto del registro, y no hay forma de traerse un enum. Mientras tanto se declara local, y la guía lo avisa |
| B10 | Una versión del canal **sin clúster**, para un Kwirth sobre ECS o escritorio | Depende de B6, y de decidir si un canal de diagnóstico de red tiene sentido sin un clúster que diagnosticar |
