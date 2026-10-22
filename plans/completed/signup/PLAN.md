# PLAN — Signup (auto-registro vía IdP)

> **Estado:** ✅ **cerrado** · 2026-10-22 · S0–S4 entregados y cascada hecha. El usuario lo da por cerrado con dos
> restos de la cascada que llevan sus dueños fuera de este plan: **excubitor** (plugin + docs 0.2.65 publicados, falta
> su entrada en el manifest privado y su pack) y **providers/azure** (WIP sin commitear). Tampoco se relanzaron harness
> ni e2e del core tras subir `common-front` 0.5.67 / `common-ai` 0.5.74 (solo typecheck): decisión del usuario.
>
> Producto y decisiones (D1–D9) en [PRD.md](PRD.md); este plan no las repite.

## 1. Estado verificado del código (2026-10-21)

- `IUser` (`common/src/Global.ts:6-21`) tiene `idp?` y **ningún** campo de estado.
- `kwirth-users`: `IdentityService.readUsers/writeUsers` (`back/src/tools/auth/IdentityService.ts`);
  `writeUsers` reescribe **el mapa entero**. El único lock es `UserApi.semaphore` (estático); `AuthApi`
  no lo usa.
- Gate del callback: `back/src/api/AuthApi.ts:172-242`. Los fallos son `302 {front}?ssoerror=<reason>` con
  strings sueltos (`unavailable`, `state`, `callback`, `unverified`, `notfound`, `idpmismatch`, `issue`).
  Éxito: handoff `TtlStore` 60 s → `?sso=<code>` → `POST /core/auth/exchange`.
- El front mapea esos strings en `front/src/App.tsx:2780-2788` (`ssoErrorMessages`).
- `IIdpInstanceConfig` vive en `common-back/src/IIdpConnector.ts:95-101`, con copia en el front
  (`front/src/components/extensions/IdpConfigDialog.tsx:22-28`). Persistido en `kwirth-idps` por
  `IdpManager`; `IdpApi.save` guarda los campos de primer nivel tal cual.
- *User security* (`front/src/components/security/ManageUserSecurity.tsx`): `GET /user` devuelve solo ids.
- 🔴 `LoginApi` (`back/src/api/LoginApi.ts:73-123`) no comprueba `user.idp`, y los usuarios de IdP creados
  desde la UI tienen `bcrypt('')` → login por password vacía sin pasar por el IdP.

## 2. Tipos nuevos (validados con D4/D5)

- `common`: `enum ESsoResult` (los 7 actuales + `PENDING`, `REJECTED`, `SIGNUPLIMIT`),
  `enum ESignupStatus { PENDING, REJECTED }`, `interface ISignupRequest { id (email), idp, name, comment?,
  requestedAt, status }`.
- `common-back`: `interface IIdpSignupPolicy { enabled, allowedDomains: string[] }`;
  `IIdpInstanceConfig.signup?: IIdpSignupPolicy`. El front deja de duplicar el tipo y lo toma de `common`
  si hace falta moverlo (a decidir en S1, sin re-exports).

## 3. Streams

| # | Entrega | Validación | Depende de |
|---|---|---|---|
| ✅ **S0** | `LoginApi` devuelve 401 a cualquier usuario con `idp` | harness: password vacía y password correcta de usuario IdP → 401; local sigue OK | — |
| ✅ **S1** | Tipos (§2) publicados (`common`, `common-back`); `ESsoResult` sustituye los strings en back y front sin cambio de comportamiento; `SignupStore` sobre `kwirth-signups`; lock único en `IdentityService` (D6) usado por `UserApi`, `LoginApi`, `AuthApi` y `SignupStore` | harness del store + regresión `AuthApi.test.ts` | — |
| ✅ **S2** | Back: rama signup en el callback (dominio, `pending`/`rejected`, tope D9) → `?signup=<code>`; `POST /core/auth/signup`; API admin `GET /user/signups`, `POST …/:id/approve` (crea usuario con `idp`, borra petición), `POST …/:id/reject`, `DELETE …/:id` | harness: criterios de aceptación 1–7 del PRD | S1 |
| ✅ **S3** | Front: sección *Signup* en `IdpConfigDialog`; diálogo "Request access" tras `?signup`; mensajes de `ESsoResult`; *Pending requests* en *User security* (approve con editor de recursos, reject, delete) con contador; toast al admin tras login | e2e Playwright + QA manual | S2 |
| ✅ **S4** | Aviso por sender: `signupSenderId`/`signupSenderConfigName` en settings | harness + QA | S2 |

Cada stream cierra su CL9.

## 4. Backlog

- **Perfiles de permisos** — conjuntos de recursos/canales con nombre, reutilizables: al aprobar un signup
  (pre-rellenar el editor con el perfil por defecto del IdP) y, en general, al dar de alta usuarios.
  Fuera de este plan; probablemente merece PRD propio.

## 5. Bitácora

- 2026-10-21 — PRD validado (D1–D9). Streams S0–S4 validados; S4 (aviso por sender) **dentro** del alcance.
  El perfil de recursos por defecto, al backlog (§4).
- 2026-10-21 — ✅ **S0 cerrado.** `LoginApi` rechaza con 401 a cualquier usuario con `idp` no vacío, en
  `/login` y en `/login/password` (contando para el rate limiter, warning en `AUTH`). **Reproducido antes
  de arreglarlo** contra el back de dev: `POST /login {user:<email IdP>, password:''}` daba **200 con
  AccessKey**. Harness 757 (+4), e2e `login-idp-password` (4 casos), QA manual validado por el usuario
  (incluida la regresión de admin y del login con Google). Guía de admin `03-user-management` corregida:
  decía *"no password is stored"*, y se guarda `bcrypt('')`.
- 2026-10-21 — ✅ **S1 cerrado.** Publicados `kwirth-common@0.5.74` (`ESsoResult`, `ESignupStatus`,
  `ISignupRequest`, `IIdpSignupPolicy`) y `kwirth-common-back@0.6.10` (`IIdpInstanceConfig.signup?`); back y
  front los usan. **Desviación de §2:** `IIdpSignupPolicy` vive en `common`, no en `common-back`, porque el
  diálogo del IdP (front) la necesita; la copia `IIdpInstance` del front se queda y gana `signup?` en S3.
  🔴 El lock era **doble** (un semáforo en `UserApi` y otro en `LoginApi`): ahora ambos toman
  `IdentityService.lock`. `SignupStore` sobre `kwirth-signups` (sin lock propio: lo toma quien llama). Los
  motivos del callback son `ESsoResult` en back y front (`Record` sobre el enum). **Cascada de common a las
  extensiones: aplazada al cierre del plan** (decisión del usuario; ninguna extensión usa estos tipos).
  Harness 773 (+11 de S1), common 20 (+3), e2e `sso-result-messages` (6 casos); QA manual validado
  (7 pasos, incluido el login con Google de una cuenta no registrada).
- 2026-10-21/22 — ✅ **S2 y S3 cerrados juntos.** S2 era solo back y el usuario **no hace QA con scripts**:
  su QA se hizo con la UI de S3, y los dos comparten CL9 (S2 no se commiteó hasta entonces).
  - **S2**: rama de signup en el callback (`?signup=<code>` de 60 s con la identidad verificada; `pending`
    / `rejected` / `signuplimit` con **50** pendientes por IdP); `POST /core/auth/signup/info` (no gasta el
    código) y `POST /core/auth/signup` (lo gasta y **lo recomprueba todo dentro del lock**: el admin puede
    haber apagado el signup, y dos envíos pelean por la última plaza — test de la carrera). El email sale
    **siempre** de la identidad, nunca del body. `SignupApi` en `/core/signups` (no bajo `/user`, que tomaría
    `signups` por un usuario): listar, aprobar —escribe el usuario **antes** de borrar la petición—,
    rechazar, borrar. Cuatro tipos más en `common@0.5.75` (`ISignupInfo`, `ISignupSubmit`, `ISignupReply`,
    `ISignupApproval`), validados por el usuario.
  - **S3**: sección *Signup* del diálogo del IdP (el back la **normaliza** al guardar: el callback la lee sin
    `guard` y una con forma rara tumbaría el core); diálogo *Request access*; peticiones en *User security*
    con Approve (exige un recurso) / Reject / Delete request; aviso al admin en cada login.
  - **Rehecho en el QA, a petición del usuario** (la UX era *"una chapuza"*): el diálogo **se adapta al
    contenido y el contenido tiene forma fija** — nada aparece ni desaparece moviendo lo demás (la lista hace
    scroll dentro de su columna, el detalle de la petición tiene un hueco reservado); la botonera tiene
    **siempre los siete botones**, solo se habilitan/deshabilitan; el editor de un recurso va en su **caja**
    (dentro de `ResourceEditor`, así que también en *API Security*), que además se ensanchó y partió sus
    filtros en dos filas. Fijado por e2e (`signup-ui`, `security-dialogs-layout`).
  - 🔴 `login-idp-password` (de S0) fallaba en la segunda corrida: 3 rechazos por corrida y el rate limiter
    corta a 5/15 min → 429. Ahora usa un usuario por corrida.
  - Guía: `03-user-management` (sección *Access requests*), `07-idp-integration` (sección *Signup*, campos
    del formulario —de paso, *Login button label* y *Enabled (show on login screen)* ya no se llamaban así—),
    `05-api-management` (filtros). Capturas por código (`capture-signup.spec.ts`): 4 rehechas y 2 nuevas,
    con los emails reales y los valores del conector difuminados y **sin conectores de pago a la vista**.
- 2026-10-22 — ✅ **S4 cerrado.** Decidido por el usuario: el sender se configura en una **pestaña nueva
  *Notifications*** de *Kwirth settings*, adonde se mueve también el del log previo (su campo de líneas pasa
  a llamarse *Lines to send*). `IKwirthSettings.signupSenderId/ConfigName` en **`common@0.5.76`**;
  `SignupNotice.ts` construye el mensaje y resuelve el par (medio par = nadie); `IAuthContext.notifySignup`
  se llama **tras responder y sin esperar**, y un fallo solo se loguea (test de que no escapa como
  `unhandledRejection`, que aquí es fatal). La pestaña se compactó para que los dos avisos quepan **sin
  scroll** (fijado por e2e). Harness 832 (+6), e2e `signup-sender` + `previous-log-sender`/`dialog-escape`
  adaptados; QA manual 9/9 validado. Guía: `02` (*Notifications*), `01-deployment`, enlaces desde `03`/`07`.
  ⚠️ Tras reiniciar el portátil el entorno e2e iba muy lento (Chromium sin arrancar en 180 s, clics de menú
  perdidos): rojos que cambiaban de sitio en cada corrida y nunca en S4; relanzados, en verde.
  **Queda la cascada** de `common` (0.5.74 → 0.5.76) y `common-back` (0.6.10) a las extensiones, aplazada
  hasta aquí por decisión del usuario.
- 2026-10-22 — ✅ **Cascada hecha** (workflow de 18 agentes, ~5 artefactos cada uno). `common-front` 0.5.67 y
  `common-ai` 0.5.74 primero; luego cada extensión que depende de alguna `kwirth-common*` sube a las nuevas y se
  republica con SU patch, con sus docs en lockstep. Nadie cambió comportamiento; ningún plugin necesitó añadir
  `implements IChannel` (ya lo declaraban). De paso, varios senders/providers que salían **sin README** en el
  tarball lo llevan ya.
  - **Públicas** (npm `@kwirthmagnify`): 48 + docs de pinocchio, manifests por tipo, 49 tags, commit `ade6da3a`.
    🔴 El clasificador del modo automático **denegó `npm publish` público** a los subagentes (*Create Public
    Surface*) y luego también a la sesión; los 25 que quedaron preparados los publicó el usuario aprobándolo en
    modo manual. Los agentes no intentaron saltárselo.
  - **De pago** (Nexus `@iriaoperae`): 22 (+ docs en lockstep), cada una con commit y tag en su repo privado;
    manifest privado commit `7c0dbfc`. **excubitor** se publicó (0.2.65 + docs) pero el usuario lo cierra en otra
    sesión: sin entrada en el manifest privado y con su pack sin publicar.
  - **jfvilas** (npm `@jfvilas`): 10 + `v16map`/`flightmap` 0.1.3, que llegaron por un PR mientras tanto.
  - **Fuera**: `providers/azure` (WIP del usuario sin commitear), `senders/gitlab-issues` y
    `webhooks/gitlab-issues` (nunca publicados).
  - ⚠️ Visto de paso, **no arreglado**: varios manifests públicos iban por detrás de npm antes de la cascada
    (validating 0.1.13 vs 0.3.2, http-pull-push 0.1.3 vs 0.3.2, idps 0.1.7 vs 0.1.8): las versiones intermedias
    se publicaron sin su entrada.
