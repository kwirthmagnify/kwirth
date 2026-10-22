# PLAN — Signup (auto-registro vía IdP)

> **Estado:** vivo · 2026-10-22 · ✅ S0, S1, S2 y S3 entregados · siguiente: S4 (y, al cerrarlo, la cascada de common)
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
| **S4** | Aviso por sender: `signupSenderId`/`signupSenderConfigName` en settings | harness + QA | S2 |

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
