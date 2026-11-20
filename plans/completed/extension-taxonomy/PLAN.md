# Tags de las extensiones — PLAN

> ✅ **Cerrado el 2026-11-20.** Cuelga de [PRD.md](PRD.md) (D1–D6) y de la [asignación](ASSIGNMENT.md).

## Fases

| # | fase | estado |
|---|---|---|
| F1 | **Datos**: `tags` en los `package.json` de las extensiones y en todas las entradas de los manifests (público por tipo, jfvilas, privado), según la asignación | ✅ 2026-11-19 (`e6fcab10` y los repos anidados) |
| F2 | **common**: `EExtensionTag` (catálogo cerrado, 55), `isExtensionTag`, `extensionTagsOf(raw: unknown)`; `tags` en `IMarketplaceEntry` y en `IDceMeta` | ✅ 0.5.95 / 0.5.96 |
| F3 | **Builds y watchers**: copian `tags` al `dist/package.json` (sin validar, D6). Los que copian el `package.json` entero no cambian | ✅ |
| F4 | **Scaffolders** (los diez): piden los tags del catálogo (`--tags a,b` en no interactivo, obligatorio), los escriben y sus plantillas los copian. Catálogo leído de `common/src/ExtensionTag.ts` (`tools/extension-tags.mjs`), sin copia. El de aitoolset añade siempre `ai` | ✅ |
| F5 | **Back**: los managers dan `tags` en la metadata de lo instalado, leídos con `extensionTagsOf` | ✅ |
| F6 | **Front**: diálogo genérico — chips de tags en tarjeta y fila (línea propia, fija), un filtro de tags **por sección**, instaladas y catálogo, independientes (AND, ancho fijo, empieza vacío, solo los tags que la sección usa, Clear). El de instaladas se añadió tras el cierre a petición del usuario: D2 solo pedía el del catálogo. Lo instalado sin tags propios toma los de su entrada de catálogo (docs, packs, lo instalado antes) | ✅ |
| F7 | **Tests**: common (catálogo y lectura), back (managers, scaffolders, **test del árbol**: todo `package.json` de extensión y toda entrada de manifest con tags del catálogo), e2e `extension-tags.spec.ts` | ✅ |
| F8 | **Guía**: tags y filtro en *Extending kwirth* | ✅ |

## Fuera del cierre

- `plugins/llm-router` (antes `vllm`), en pleno renombrado por otra sesión: sus tags (`ai` `llm`) y la copia
  en build/watch están puestos **sin commitear**, por indicación del usuario; los commitea esa sesión.
- Las extensiones toman el `tags` en su próximo bbpm: hasta entonces su `dist/package.json` publicado no los
  lleva, y el front cubre el hueco con los del catálogo. El bbpm copia `tags` a la entrada del manifest.
