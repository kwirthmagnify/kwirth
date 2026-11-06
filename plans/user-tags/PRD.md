# Tags de usuario — PRD

> **Estado:** vivo, sin empezar · abierto 2026-11-06 · plan en [PLAN.md](PLAN.md).

## 1. Problema

Una extensión no sabe nada de la persona que la usa más allá de su `id`, su nombre y su IdP (`IUserInfo`). No
puede adaptar lo que hace a **quién es** esa persona: un canal con un asistente de IA debería responder a un
directivo con una visión general y datos de alto nivel, y a un SRE con detalles técnicos, pods en crash y
comandos. Hoy, para eso, cada extensión tendría que llevar su propia tabla usuario → tipo de usuario, y cada una
la suya.

## 2. Qué se quiere

Que un administrador pueda **etiquetar** a cada usuario de Kwirth con **tags**, y que cada extensión lea los tags
del usuario y decida qué hace con ellos.

- **UC1** — un usuario etiquetado como directivo pregunta al asistente por el estado del cluster y recibe una
  visión general: salud, CPU y memoria agregadas, sin jerga.
- **UC2** — un usuario etiquetado como SRE hace la misma pregunta y recibe el detalle técnico: qué falla, dónde,
  reinicios, eventos, qué comando ejecutar.

## 3. Decisiones (con el usuario, 2026-11-06)

- **D1 · Tags, no perfiles.** Un usuario lleva una **lista** de tags; no hay un campo "perfil" ni un rol.
- **D2 · Espacio de nombres por extensión: `<extensión>:<valor>`.** Cada extensión crea y lee sus propios tags
  (`chat:executive`, `chat:sre`, `reports:finance`…) sin chocar con los de otra. Una extensión **ignora** los
  tags que no son suyos.
- **D3 · El core no interpreta los tags.** Los guarda, los valida (forma), deja editarlos y los entrega. Lo que
  significan es decisión de cada extensión: la autorización y el negocio son del canal, no del core.
- **D4 · Los tags no dan permisos.** Ninguna extensión debe usarlos para conceder acceso: para eso están los
  scopes del accessKey. Un tag cambia **cómo** se hace algo, nunca **si** se puede.

## 4. Alcance

- `IUser.tags?: string[]` y `IUserInfo.tags?: string[]` en `common`.
- El back los guarda con el usuario (secret `kwirth-users`), los valida al guardar y los entrega en
  `getUsers()` a los canales.
- La administración de usuarios del front permite añadirlos y quitarlos (chips), **solo el admin**. Un usuario no
  edita sus propios tags.
- Portabilidad: los tags viajan con el usuario en la exportación de configuración.

**Forma de un tag:** `<extensión>:<valor>`, en minúsculas. `<extensión>` como un id de extensión
(`[a-z][a-z0-9-]*`), `<valor>` con letras, dígitos, `.`, `_` y `-`; hasta 64 caracteres cada parte. Como máximo
32 tags por usuario. Repetidos, se quitan.

## 5. Fuera de alcance (V2)

- **Mapear grupos del IdP a tags** (un grupo de Entra ID → `chat:sre`), para no etiquetar a mano a los usuarios
  que vienen del IdP.
- **Catálogo de tags declarado por las extensiones** (que una extensión diga "estos son mis tags" y el diálogo
  los ofrezca en un desplegable). En la primera versión el admin los teclea.
- Tags en otras entidades (grupos de usuarios, accessKeys).
