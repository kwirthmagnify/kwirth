# Tags de usuario — PLAN

> **Estado:** ✅ **cerrado el 2026-11-12** · abierto 2026-11-06 · cuelga de [PRD.md](PRD.md). Un solo stream: el cambio
> es pequeño y no tiene sentido entregar los tipos sin quien los edite.

## U1 · Tags en el usuario, de punta a punta — ✅ cerrado (2026-11-12, `kwirth-common@0.5.80`)

- [x] **common**: `tags?: string[]` en `IUser` y en `IUserInfo`; `USER_TAG_RE`, `USER_TAGS_MAX` (32),
      `normalizeUserTags(raw)` (forma, minúsculas, sin repetidos; **no** tira los mal formados, para que se digan),
      `userTagsProblem(tags)` (el motivo, o nada) y `userTagsOf(tags, extensionId)` (los de una extensión),
      exportados para que back y front validen igual. Sin tipos nuevos. Bump + bbp (`0.5.80`, npm público).
- [x] **back**: al crear y al editar un usuario se normalizan sus tags y uno mal formado (o más de 32) se rechaza
      con el motivo (`UserApi.tagsOfBody`); lista vacía = sin campo. `getUsers()` los entrega en `IUserInfo` por
      `userInfoOf` (`tools/auth/UserInfo.ts`), que los normaliza otra vez y descarta los mal formados por si el
      Secret se editó a mano. Sin migración: sin campo = sin tags. ⚠️ **La exportación de configuración no lleva
      usuarios**, así que no hay nada que portar (el PRD lo daba por hecho).
- [x] **front**: en *User security*, campo **Tags** con chips (se teclea y Enter), solo admin; chip rojo + motivo
      bajo el campo + *Save* deshabilitado si uno está mal. El error del back se muestra tal cual. **Del QA**: *New*
      dejaba el texto a medio escribir, y un tag escrito **sin Enter** se perdía al guardar → el texto se controla y
      **cuenta como tag** para validar y para guardar.
- [x] **common-back**: nada que cambiar ni publicar: su rango `kwirth-common ^0.5.74` ya admite la 0.5.80; cada
      consumidor la recibe al subir su propia dependencia.
- [x] Harness: common +4 (forma, normalización, límite, `userTagsOf`); back +7 (API: guardar, leer, editar,
      rechazar, sin campo; `userInfoOf`) → 884. e2e `user-tags` (4 casos, no destructivo: crea y borra su usuario):
      chip, mal formado, persiste, sin Enter, *New* limpia. Sin regresión en `security-dialogs-layout` y `signup-ui`.
- [x] Guía del admin (`docs/0.6.31/guide/admin/03-user-management.md`, sección *User tags*): qué son, la forma, que no
      dan permisos, cómo se editan, que cada extensión documenta los suyos. Recapturadas `admin-user-security`,
      `admin-user-idp` y `admin-signup-request`. **CL9**.

**Primer consumidor:** IRIA Agora (S4b de `iria/plans/serverless-metrics/`), que elige fragmentos del system prompt del
bot por los tags `agora:*` del usuario que lo menciona.

**Queda para V2** (PRD §5): mapear grupos del IdP a tags, catálogo de tags declarado por las extensiones, tags en otras
entidades. Y, visto al cerrar: al **aprobar una solicitud de acceso** no se piden tags (se ponen editando el usuario
después).
