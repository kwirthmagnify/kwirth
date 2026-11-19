# Tags de las extensiones — PRD

> **ESTADO — PRD validado (2026-11-19)**, con la [asignación](ASSIGNMENT.md). El cómo y en qué orden, en
> [PLAN.md](PLAN.md).

## El problema

El marketplace ya tiene más de cien extensiones de once tipos, y lo único que las ordena es el **tipo**
(plugin, provider, sender…). El tipo dice *cómo* está hecha una extensión, no *para qué* sirve: el plugin
`log`, el provider `metrics` y el sender `datadog` sirven los tres a la observabilidad y salen en tres
listas distintas; `asteroids` y `magnify` salen juntos porque los dos son plugins.

Quien busca "algo para métricas", "lo que usa IA" o "los juegos" no tiene por dónde filtrar.

## Qué se quiere

Una propiedad nueva en **todas** las extensiones, de los once tipos: **`tags`**, una lista de etiquetas que
dicen para qué sirve (`observability`, `log`, `kubernetes`, `ai`, `game`, `arcade`…). Una extensión lleva
**las que le toquen**, sin límite: agora es a la vez `ai`, `operations`, `observability`, `sre`, `devops` y
`kubernetes`.

## Decisiones tomadas

| # | decisión | elegido |
|---|---|---|
| D1 | Valores | **Catálogo cerrado** en `common`: un enum con todos los tags. Un tag fuera del catálogo **no se publica** (falla el build). Añadir uno = subir `common`. Así no conviven `log` y `logs` (2026-11-19) |
| D2 | Uso en la UI | **Filtro** por tags en el catálogo del marketplace, y **chips** con los tags en las tarjetas, del catálogo y de las instaladas (2026-11-19) |
| D3 | Alcance | **Todas** las extensiones existentes, públicas, de jfvilas y de pago, más el soporte para las nuevas (scaffolders, builds, watchers). Las de pago, con su propio ciclo de publicación (2026-11-19) |
| D4 | Modelo | **Tags**, no área + categoría: una extensión sirve a varias cosas a la vez (agora es operations, observability, sre y devops) y un único área la obligaba a elegir. Sustituye al área/categoría de la primera versión de este PRD (2026-11-19) |
| D5 | Reglas de asignación | Lleva **`ai`** toda extensión que usa IA; lleva **`kubernetes`** toda la que sirve para hacer cosas en Kubernetes (2026-11-19) |

## Dónde viajan

Igual que `description`, `icon` o `requiresExtension` hoy — el mismo camino, sin uno nuevo:

1. **`package.json` de la extensión**: `tags: string[]`. Es la fuente.
2. **`build.mjs` y `watch.mjs`** de cada extensión: copian `tags` al `dist/package.json` (hoy copian los campos
   uno a uno, así que hay que añadirlo en los **212** scripts) y **validan** contra el catálogo: un tag que no
   existe, o una lista vacía, aborta el build.
3. **Manifest** del tipo (público), el de jfvilas y el privado (`marketplace/manifest.json`): `tags` en cada
   entrada, junto a `requires`. El **bbpm** lo sincroniza desde el `package.json`, como ya hace con `requires`.
4. **Back**: los **once** managers leen `tags` del `package.json` al instalar y lo dan con el resto de la
   metadata de la instalada; `IMarketplaceEntry` lo lleva para el catálogo.
5. **Front**: filtro y chips (D2).
6. **Scaffolders** (`tools/create-kwirth-*.mjs`, diez): piden los tags (de los del catálogo) y los escriben en el
   `package.json`, y sus plantillas de `build.mjs`/`watch.mjs` ya los copian y validan.

## Reglas

- **Obligatorios para publicar**: al menos un tag, todos del catálogo. Ninguna versión nueva sale sin ellos.
- **Lo ya publicado no se rompe**: una entrada de manifest o una instalada sin tags se muestra sin chips y solo
  aparece con el filtro vacío. Ni el core ni el instalador los exigen.
- `docs` hereda los tags de la extensión que documenta (`targetType` + `id`), y un **pack** los del **plugin que
  incluye**. Ninguno de los dos los declara por su cuenta.
- En el manifest se ponen en **todas las entradas de cada id** (también las versiones antiguas): es metadata del
  producto, no de la versión.
- El **filtro** con varios tags marcados enseña las extensiones que los llevan **todos** (`ai` + `kubernetes` = lo
  que usa IA sobre Kubernetes): marcar más estrecha, que es lo que se espera de un filtro.

## El catálogo

Sale de la [asignación](ASSIGNMENT.md) de las 128 extensiones, validada el 2026-11-19; son los tags que aparecen
allí (55):

`ai` `alert` `arcade` `assistant` `automation` `aviation` `chat` `cloud` `collaboration` `compliance` `cyber`
`dashboard` `debug` `development` `devops` `emulator` `events` `game` `gitops` `health` `homepage` `identity`
`incidents` `ingest` `integration` `kubernetes` `library` `live-data` `llm` `log` `login` `media` `metrics`
`music` `networking` `news` `notifications` `observability` `operations` `platform` `routing` `sample`
`security` `setup` `source` `sre` `storage` `theme` `ticketing` `topology` `traces` `traffic` `ui` `vm`
`vulnerabilities`

## Fuera de alcance

- Tags libres que no estén en el catálogo.
- Buscar por texto libre en el marketplace.
- Agrupar por tag las listas de los managers de instaladas (D2 dejó solo filtro y chips).
