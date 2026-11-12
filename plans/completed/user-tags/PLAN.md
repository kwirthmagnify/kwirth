# Tags de usuario — PLAN

> **Estado:** vivo, sin empezar · abierto 2026-11-06 · cuelga de [PRD.md](PRD.md). Cada stream cierra con su
> **CL9**. Un solo stream: el cambio es pequeño y no tiene sentido entregar los tipos sin quien los edite.

## U1 · Tags en el usuario, de punta a punta

- [ ] **common**: `tags?: string[]` en `IUser` y en `IUserInfo`; `USER_TAG_RE` y `normalizeUserTags(raw)` (forma,
      minúsculas, sin repetidos, como mucho 32) exportados, para que back y front validen igual. Bump + bbp.
- [ ] **back**: al guardar un usuario se normalizan sus tags y uno con forma inválida se rechaza con el motivo;
      `getUsers()` (`back/src/index.ts`) los entrega en `IUserInfo`; la exportación de configuración los lleva.
      Un usuario sin el campo es un usuario sin tags: no hay migración.
- [ ] **front**: en la administración de usuarios (`ManageUserSecurity`), un campo de tags con chips, solo para
      el admin, que avisa de un tag mal formado antes de guardar.
- [ ] **common-back**: nada que cambiar en la interfaz (`getUsers()` ya existe); subir la dependencia de
      `common` para que el tipo llegue a los canales.
- [ ] Harness: normalización y validación; `getUsers()` con y sin tags. e2e: añadir y quitar un tag a un usuario
      de prueba y comprobar que persiste (no destructivo: el usuario lo crea y lo borra el propio test).
- [ ] Guía del admin: qué son, la forma `<extensión>:<valor>`, que no dan permisos. **CL9**.

**Primer consumidor:** un canal de pago con asistente de IA, que elige el system prompt por el tag. Su trabajo
va en su propio plan (privado).
