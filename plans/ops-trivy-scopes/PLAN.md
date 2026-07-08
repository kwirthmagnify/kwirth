# Plan — ops/trivy declaran sus scopes RBAC (getScopeCatalog)

## Contexto
El mecanismo de **scopes declarados por plugin** ya existe (ver `plans/plugin-scopes/PLAN.md`):
cada canal expone su catálogo vía `IChannel.getScopeCatalog()` (front y back), el core lo agrega en
`GET /core/scopes` y el editor de seguridad (User/API) lo consume.

Los scopes de **ops** (`ops$get`, `ops$execute`, `ops$xterm`, `ops$restart`) y **trivy**
(`trivy$workload`, `trivy$kubernetes`) **todavía NO** los declaran esos plugins. Mientras tanto viven,
de forma **temporal**, como `LEGACY_PLUGIN_SCOPES` en `back/src/tools/ScopeCatalog.ts`.

## Objetivo
Que **ops** y **trivy** declaren sus propios scopes (con label + description) vía `getScopeCatalog()`
en su canal (back; y front si aplica), como hace Defender con `DEFENDER_SCOPES`. Al terminar, **retirar**
`LEGACY_PLUGIN_SCOPES` del core.

## Pasos
1. **ops**: definir `OPS_SCOPES: IExtensionScope[]` en su `src/common` + `getScopeCatalog()` en el canal
   back (y front si lo hubiera). Bumpear deps common\*, bb/publish según corresponda (plugin free → publish).
2. **trivy**: ídem con `TRIVY_SCOPES`.
3. **core**: eliminar `LEGACY_PLUGIN_SCOPES` de `back/src/tools/ScopeCatalog.ts` (y su uso en
   `buildScopeCatalog`). Verificar que `/core/scopes` sigue sirviendo esos scopes desde los plugins.
4. Verificar en User/API Security que `ops$*`/`trivy$*` siguen apareciendo (ahora desde los plugins).

## Notas
- Nomenclatura `<plugin>$<scope>` (ya la cumplen).
- ops/trivy son plugins **free** → al tocar su código: bump + build + publish + manifest (bbpm), cascada si aplica.
- Este trabajo es de los plugins ops/trivy, **independiente** del plan de scopes/Defender.
