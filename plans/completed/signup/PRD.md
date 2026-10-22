# PRD — Signup (auto-registro vía IdP)

> **Estado:** validado · 2026-10-21 · D1–D9 cerradas por el usuario · implementación en [PLAN.md](PLAN.md)

## 1. Resumen ejecutivo

Hoy el acceso por IdP es **lista blanca estricta**: un usuario que se autentica bien en Google/Entra/… pero
no está en `kwirth-users` recibe `notfound` y se queda fuera, y el admin tiene que darlo de alta a mano
sabiendo de antemano su email. Este PRD añade el **signup**: si el admin lo habilita **en un IdP concreto**,
ese usuario puede **pedir acceso**; la petición queda **pendiente de validación** y no entra en Kwirth hasta
que un admin la **aprueba** (asignándole permisos) o la **rechaza**.

**Criterio de éxito:** un usuario desconocido hace login con un IdP con signup habilitado, pide acceso, ve
"pendiente"; el admin lo ve en *User security*, lo aprueba con unos recursos, y en el siguiente login el
usuario entra con exactamente esos permisos. Con signup deshabilitado, el comportamiento es el de hoy, byte
a byte.

## 2. El problema

- El alta manual exige que el admin conozca el email exacto del usuario **y** el IdP con el que entrará.
  En equipos que crecen, el canal real es "mándame tu email por Teams", y los errores de tecleo acaban en
  `notfound` sin pista para nadie.
- El usuario rechazado no tiene forma de decir "quiero entrar": el mensaje es un callejón sin salida.
- El admin no tiene visibilidad de quién lo está intentando.

## 3. Personas

- **Usuario externo** — tiene identidad en el IdP corporativo o público, no tiene usuario en Kwirth.
- **Admin de Kwirth** — decide qué IdPs admiten signup y valida las peticiones.
- (Fuera) **Usuario interno** (usuario/contraseña de Kwirth): **no hay signup** para ellos.

## 4. Objetivos y no-objetivos

**Objetivos**
- Signup **opt-in por instancia de IdP**, deshabilitado por defecto.
- Petición pendiente **sin ningún acceso**: ni AccessKey, ni login por password, ni aparece en pickers.
- Aprobación con asignación de **recursos/permisos** en el mismo gesto.
- Restricción opcional por **dominio de email** (imprescindible en IdPs públicos como Google).
- Aviso al admin de que hay peticiones pendientes.

**No-objetivos**
- Signup de usuarios internos (usuario/contraseña).
- Aprobación automática / auto-provisión con permisos por defecto sin intervención humana.
- Mapeo de grupos/roles del IdP a recursos de Kwirth (posible evolución, no esta).
- Workflows multi-aprobador, emails al usuario solicitante.

## 5. Conceptos

- **Signup request** — petición de acceso: `{ email, idp, name, comment?, requestedAt, status }`.
- **Estados:** `pending` → `approved` (deja de ser petición: pasa a ser usuario) | `rejected`.
- **Política de signup del IdP** — `{ enabled, allowedDomains[] }` dentro de la config de la instancia.

## 6. Requisitos funcionales

- **RF1** — El diálogo de configuración de cada IdP tiene una sección *Signup*: switch *Allow signup* y
  lista opcional de dominios permitidos (vacía = cualquiera).
- **RF2** — En el callback, si la identidad es válida (`email_verified`) pero el email **no** está en
  `kwirth-users`, y el IdP tiene signup habilitado y el dominio pasa el filtro → el front muestra
  *"Tu cuenta no tiene acceso. ¿Quieres solicitarlo?"* con nombre (pre-rellenado del IdP) y comentario
  opcional. Con signup deshabilitado → `notfound` como hoy.
- **RF3** — Enviar la solicitud crea la petición `pending`. El usuario ve "Solicitud enviada, un
  administrador la revisará".
- **RF4** — Un login posterior de alguien con petición `pending` → mensaje *"Tu solicitud está pendiente"*
  (no se crea otra). Con `rejected` → *"Tu solicitud fue rechazada"*.
- **RF5** — *User security* muestra una sección **Pending requests** (contador visible) con email, IdP,
  nombre, comentario, fecha. Acciones: **Approve** (abre el editor de recursos/canales, como al crear un
  usuario, con `idp` fijado) y **Reject**. Las rechazadas se pueden borrar (lo que permite volver a pedir).
- **RF6** — Al hacer login un admin, si hay peticiones pendientes, aviso (toast) con enlace a *User security*.
- **RF7** — Aprobar crea el usuario en `kwirth-users` con `idp` = la instancia de la petición y elimina la
  petición. El siguiente login por IdP entra con normalidad.
- **RF8** — Tope de peticiones pendientes por IdP (anti-spam en IdPs públicos); superado → la solicitud se
  rechaza con mensaje genérico y queda log de warning.

## 7. Decisiones cerradas (validadas 2026-10-21)

- **D1 — Las peticiones viven en un Secret propio, `kwirth-signups`, no en `kwirth-users`.** Un pendiente
  no es un usuario: así `LoginApi`, `AuthApi`, `getUsers` y los pickers no necesitan saber nada de estados
  y es **imposible por construcción** que un pendiente obtenga una AccessKey. Descartado: `IUser.status`,
  que obligaría a filtrar en cada sitio que lee usuarios (y basta olvidarse de uno).
- **D2 — Signup explícito, no implícito.** El primer login fallido no crea la petición: el usuario la
  confirma (RF2/RF3). Evita peticiones basura de quien se equivocó de cuenta.
- **D3 — Handoff como el login**: el callback redirige a `?signup=<code>` (TTL 60 s, un solo uso, guarda
  la identidad verificada) y el front hace `POST /core/auth/signup {code, name, comment}`. El email **nunca**
  viene del front: sale de la identidad verificada en el callback.
- **D4 — Los motivos de error del callback pasan a enum en common** (`ESsoResult`: `notfound`,
  `idpmismatch`, `unverified`, `state`, `callback`, `unavailable`, `issue`, + `pending`, `rejected`,
  `signuplimit`). Hoy son strings sueltos en back y front.
- **D5 — La política de signup es un campo de primer nivel de la instancia**
  (`IIdpInstanceConfig.signup?: IIdpSignupPolicy`), no parte del `config` del conector: es del core, igual
  para todos los conectores (públicos y de pago).
- **D6 — Un único lock para `kwirth-users` y `kwirth-signups`** en `IdentityService` (hoy el semáforo es
  estático de `UserApi`); la aprobación escribe en los dos.
- **D7 — Rechazadas se conservan** hasta que el admin las borre (evita que alguien re-pida en bucle).
- **D8 — Aviso al admin en el front** (patrón `checkPreviousContainer`). Aviso por **sender** (Slack/Teams…)
  queda como stream opcional, mismo patrón que `previousLogSender*` en settings.
- **D9 — Tope por IdP: 50 pendientes** (configurable más adelante si hace falta).

## 8. Lo que hay que decir en voz alta

- 🔴 **Bug de seguridad existente, independiente del signup** (verificado leyendo el código): un usuario
  de IdP creado desde la UI se guarda con `password = bcrypt('')` (`ManageUserSecurity.tsx` envía `''`,
  `UserApi.ts` lo hashea) y `LoginApi` **no comprueba `user.idp`** → `POST /login {user:<email>, password:''}`
  le daría AccessKey **sin pasar por el IdP**. Con signup habría más usuarios de IdP, así que se arregla
  primero (stream S0): `LoginApi` rechaza a cualquier usuario con `idp`.
- Con Google y signup sin dominios, **cualquier cuenta de Gmail del mundo** puede generar peticiones. El
  diálogo lo avisa; el tope D9 acota el daño.
- `PUT /user` reemplaza el objeto entero: la aprobación no lo usa, crea con `POST`.

## 9. Criterios de aceptación

1. Signup deshabilitado: un desconocido recibe `notfound`, igual que hoy (test de regresión).
2. Signup habilitado + dominio no permitido → `notfound`.
3. Signup habilitado → solicitud → `pending` visible al admin; re-login → mensaje "pendiente", sin AccessKey.
4. Aprobación con recursos X → login OK con exactamente X.
5. Rechazo → re-login → "rechazada"; borrar la rechazada → puede volver a pedir.
6. `POST /login` con email de un usuario de IdP y password vacía → 401.
7. Superado el tope → `signuplimit`.

## 10. Abierto

- ~~¿Aviso por sender en este alcance?~~ → **sí**, stream S4 (2026-10-21).
- ~~¿Perfil de recursos por defecto por IdP al aprobar?~~ → **backlog**, como parte de un concepto más
  general de **perfiles de permisos** (2026-10-21).
