# Filtro de IP en el login — PRD

> **Estado:** vivo, sin empezar · abierto 2026-11-12 · plan en [PLAN.md](PLAN.md).

## 1. Resumen ejecutivo

Un administrador de Kwirth puede restringir **desde qué direcciones IP se puede iniciar sesión**, con una
lista de IPs y CIDR que configura en una pestaña nueva de *Kwirth settings*. Con la lista vacía no cambia
nada.

**Criterio de éxito:** con la lista `10.0.0.0/8` configurada, un login (usuario/contraseña, cambio de
contraseña, IdP o signup) desde fuera de esa red se rechaza con un mensaje claro, y **no hay forma de
saltárselo falsificando `X-Forwarded-For`**.

## 2. El problema

Hoy cualquiera que llegue a la URL de Kwirth puede intentar entrar. El rate limiter frena la fuerza bruta,
pero no reduce la superficie: una instalación que solo deben usar personas desde la red corporativa o la VPN
no tiene forma de decirlo sin tocar el ingress, y el ingress no siempre es del equipo que opera Kwirth.

Además, la IP de origen que el core usa hoy **no es fiable**:

- se toma `X-Forwarded-For` tal cual llega, así que cualquiera puede inventársela (y con ella, esquivar
  también el rate limiter, cuya clave es `ip:usuario`);
- `(req as any).clientIp` nunca lo rellena nadie (`request-ip` está en el `package.json` y no se monta);
- detrás de un ingress, `socket.remoteAddress` es el pod del ingress, no el cliente.

## 3. Personas

- **Administrador de Kwirth**: configura la lista y los proxies de confianza; es quien puede quedarse fuera.
- **Operador del cluster**: tiene `kubectl` y es la vía de escape si el administrador se equivoca.
- **Usuario final**: si está fuera de la lista, tiene que entender por qué no entra.

## 4. Objetivos y no-objetivos

**Objetivos**

- Lista de IPs/CIDR (IPv4 e IPv6) permitidas para iniciar sesión, editable en caliente desde la UI.
- Resolución de la IP del cliente **correcta y no falsificable**, con una lista de proxies de confianza.
- Que nadie se pueda dejar fuera a sí mismo desde la UI.

**No-objetivos**

- Filtrar **cada petición**: un accessKey ya emitido o una API key de automatización siguen funcionando
  desde cualquier IP (D2).
- Listas por usuario o por grupo, listas de denegación, geolocalización.
- Variable de entorno para desactivar el filtro (D6).

## 5. Conceptos

- **Lista permitida (`allowed`)**: IPs o CIDR desde los que se puede iniciar sesión. Vacía = filtro apagado.
- **Proxies de confianza (`trustedProxies`)**: IPs o CIDR cuyo `X-Forwarded-For` se cree. Solo se mira esa
  cabecera si la conexión viene de uno de ellos, y se recorre de derecha a izquierda saltando los saltos de
  confianza: la IP del cliente es el primer salto que **no** es de confianza (el mismo algoritmo que
  `trust proxy` de Express).
- **IP del cliente**: la que resulta de lo anterior. Es la que se filtra, la que usa el rate limiter y la que
  se apunta en el accessKey.

## 6. Requisitos funcionales

- **RF1** · `IKwirthSettings.loginIpFilter?: ILoginIpFilter` (`enabled: boolean`, `allowed: string[]`,
  `trustedProxies: string[]`), persistido en el ConfigMap `kwirth.settings` del core. El filtro actúa solo
  si `enabled` **y** `allowed` no está vacía (D9).
- **RF2** · Se comprueba la IP del cliente, **antes** que el rate limiter y sin contar como intento fallido, en:
  `POST /login`, `POST /login/password`, `GET /core/auth/:instanceId/start`,
  `GET /core/auth/:instanceId/callback`, `POST /core/auth/signup/info` y `POST /core/auth/signup`.
- **RF3** · El rechazo es tipado: `403 { refusal: ELoginRefusal.IPNOTALLOWED }` en las rutas JSON y
  `ESsoResult.IPNOTALLOWED` en la redirección del IdP. El front muestra *"Login is not allowed from your
  IP address."* sin decidir por texto.
- **RF4** · Una sola función común resuelve la IP del cliente y sustituye las cuatro copias de
  `clientIp || x-forwarded-for || remoteAddress` (LoginApi ×3, AuthApi, rateKey) y la del WebSocket.
- **RF5** · Al guardar (PUT de settings **y** import de configuración), el back rechaza con 400:
  - una entrada que no es una IP ni un CIDR válidos;
  - una lista permitida que **no incluye la IP del administrador que guarda**.
- **RF6** · La pestaña **Login access** de *Kwirth settings* edita las dos listas y muestra cómo ve Kwirth al
  que la está usando: su IP resuelta, la dirección de la conexión y si llegó `X-Forwarded-For` que se ha
  ignorado por no venir de un proxy de confianza.
- **RF7** · Desktop (Electron/Tauri): el loopback (`127.0.0.0/8`, `::1`) se permite siempre.

## 7. Decisiones cerradas (con el usuario, 2026-11-12)

- **D1 · ConfigMap `kwirth.settings`, no un Secret.** Una lista de IPs no es un secreto; vive junto al resto
  de settings del core y funciona igual en Kubernetes, Docker y Node.
- **D2 · Solo el login.** Se filtra donde se emite un accessKey, no cada petición.
- **D3 · Signup y SSO incluidos.** Son caminos de entrada anónimos igual que el login.
- **D4 · Lista vacía = apagado.** Ninguna instalación existente cambia de comportamiento por el filtro.
- **D5 · Proxies de confianza explícitos.** Sin ellos, `X-Forwarded-For` se ignora. Es lo único que hace el
  filtro no falsificable.
- **D6 · Vía de escape = editar el ConfigMap** (`kubectl edit configmap kwirth.settings` y poner
  `"enabled": false` dentro de `loginIpFilter`; en Docker/Node, el fichero del store). Sin variable de entorno.
- **D7 · El login lee los settings en cada intento**, no una copia en memoria: así la vía de escape surte
  efecto al momento, sin reiniciar el core. Es una lectura más por login, del mismo orden que la del Secret
  de usuarios que ya se hace.
- **D8 · Tipos validados** (`ILoginIpFilter`, `loginIpFilter`, `ELoginRefusal`, `ESsoResult.IPNOTALLOWED`).
- **D9 · Interruptor explícito, apagado la primera vez** (usuario, 2026-11-12). `ILoginIpFilter.enabled`;
  una instalación nueva arranca con el filtro apagado y entra todo el mundo. Encendido con la lista vacía
  también entra todo el mundo: una edición a mano del ConfigMap nunca puede dejar fuera a todos. Desde la UI,
  encenderlo con una lista que no incluye a quien guarda lo rechaza RF5. **Y encenderlo con la lista vacía
  tampoco se puede guardar** (QA, 2026-11-12: "lo activo y traga" — marcar *Restrict* y que no restrinja
  nada es un engaño). En ejecución esa combinación sigue dejando entrar a todos; solo se impide guardarla.
- **D10 · Falla cerrado si los settings no se pueden leer** (decidido al implementar). En Kubernetes, un
  error leyendo el ConfigMap (no un 404) no es "filtro vacío": el login responde 503 y el IdP `unavailable`.
  Los stores de fichero (Docker/Node) devuelven el valor por defecto ante cualquier error y no lo distinguen.

## 8. Lo que hay que decir en voz alta

- ⚠️ **Cambio de comportamiento para todos, con el filtro apagado.** Arreglar la IP del cliente (RF4) hace
  que, sin proxies de confianza configurados, una instalación detrás de un ingress vea a **todos** con la IP
  del ingress. Consecuencias: el accessKey apunta esa IP, y el rate limiter (`ip:usuario`) se vuelve solo
  por usuario, así que un atacante que falle 5 veces con `admin` **bloquea el login de `admin` 15 minutos
  para todos**. Hoy ese bloqueo no es posible, pero a cambio el rate limiter se puede esquivar rotando
  `X-Forwarded-For`, que es peor. La pestaña avisa cuando detecta el caso (RF6) y la guía lo explica.
- ⚠️ **No protege una sesión robada.** Un accessKey filtrado se usa desde cualquier sitio (D2).
- ⚠️ **El import de configuración puede traer una lista de otro cluster.** Por eso RF5 valida también el
  import con la IP de quien importa.
- ⚠️ **La vía de escape exige `kubectl`** (o acceso al store). Quien solo tiene la UI y se queda fuera depende
  del operador. Desde la UI no se puede llegar a eso (RF5), pero sí si cambia la IP del administrador (VPN
  nueva, IP dinámica) después de guardar.

## 9. Criterios de aceptación

- **CA1** · Con la lista vacía, el login funciona igual que antes (salvo lo de §8 sobre la IP resuelta).
- **CA2** · Con una lista que no incluye al cliente, las seis rutas de RF2 rechazan con el código tipado y el
  front muestra el mensaje.
- **CA3** · Mandar `X-Forwarded-For` con una IP permitida desde una IP no permitida **no** deja entrar.
- **CA4** · Detrás de un proxy de confianza, la IP resuelta es la del cliente real.
- **CA5** · El PUT y el import rechazan una lista que deja fuera a quien guarda, y entradas mal formadas.
- **CA6** · Tras `kubectl edit` vaciando la lista, el siguiente login entra sin reiniciar el core.

## 10. Abierto

- Filtrar también cada petición (V2), con una lista aparte para las API keys de automatización.
