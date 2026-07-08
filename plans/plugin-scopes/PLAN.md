# Plan — Scopes RBAC expuestos por los plugins (dinámicos, no hardcodeados)

## Problema
Hoy el editor de seguridad (`front/src/components/security/ResourceEditor.tsx`) tiene un **enum fijo** `allScopes`
con los scopes seleccionables, incluyendo scopes de plugins **hardcodeados** (`ops$get`, `ops$execute`,
`ops$xterm`, `ops$restart`, `trivy$workload`, `trivy$kubernetes`). Los de **Defender**
(`defender$polview/poledit/poladmin`) **no están** → no se pueden conceder desde el User/API Security.

Bundlear los scopes de cada plugin en el core no escala: cada plugin nuevo obliga a tocar el core.

## Objetivo
Que **cada plugin/extensión exponga los scopes que usa** (nomenclatura **`<plugin>$<scope>`**), con etiqueta y
descripción, y que el core + el editor de seguridad los lean **dinámicamente** de los plugins instalados.
Empezar por **Defender** y luego migrar el resto (ops, trivy, …) y retirar el hardcode.

## Modelo (RUNTIME, vía IChannel — no metadata estática)
Los scopes se exponen **en runtime** por el canal, accesibles en **front (consumir/poblar select)** y
**back (validar/gestionar RBAC)**. `IChannel` es único: `front/src/channels/IChannel.ts` re-exporta el de
`common-front`; el back tiene su `IChannel` en `common-back`.

- **Tipo compartido (`common/src`):** `IExtensionScope { scope: string; label: string; description: string }`
  (accesible desde common-front y common-back, que re-exportan common). `scope` sigue `<plugin>$<scope>`.
- **Interfaces de canal:** método **opcional** `getScopes?(): IExtensionScope[]` en:
  - `IChannel` de **common-front** (junto a `getScope()`, que NO se toca — es la puerta de acceso).
  - `IChannel` de **common-back**.
  Opcional → no rompe canales existentes ("sin tocar lo que hay").
- **Declaración en el plugin (single-source en su `common/`):** p.ej. Defender define
  `DEFENDER_SCOPES: IExtensionScope[]` (usando `EDefenderScope`) en `src/common/`, y **tanto el canal front
  como el back** devuelven ese mismo array en su `getScopes()`.
  ```ts
  export const DEFENDER_SCOPES: IExtensionScope[] = [
    { scope: EDefenderScope.POLICY_VIEW,  label: 'Defender · View',  description: 'Ver findings, scores y policies (solo lectura)' },
    { scope: EDefenderScope.POLICY_EDIT,  label: 'Defender · Edit',  description: 'Crear/versionar/clonar/asignar policies' },
    { scope: EDefenderScope.POLICY_ADMIN, label: 'Defender · Admin', description: 'Config (scoring/azure/general/ownership) + borrar policies' },
  ]
  ```
- **Core FRONT:** agrega `getScopes()` de los canales de `frontChannels` (App.tsx) → pasa la lista a
  `ManageUserSecurity`/`ManageApiSecurity` → `ResourceEditor` sustituye el enum fijo por
  **core built-in + scopes de plugins** (muestra `label`, `description` en tooltip; guarda el string).
- **Core BACK:** agrega `getScopes()` de los canales registrados → catálogo para **validar** (que un scope
  concedido existe) y **gestionar** el RBAC.

## Implicación de publicación
Toca `common` + `common-front` + `common-back` (tipo nuevo + método en interfaces) → **republicar** esos 3 y
**cascada** a artefactos free (ver regla de cascade). Defender = bb (no publish). Decisión: hacerlo bien
(tipo en common + cascade) vs. inlinar el tipo en core/Defender para el MVP y promover a common al final.

## Fases (MVP incremental)
- **F1 ✅ HECHO** (runtime vía `IChannel.getScopeCatalog()`, NO manifest): `IExtensionScope` en common;
  `getScopeCatalog?()` en `IChannel` de common-front y common-back; **Defender** declara `DEFENDER_SCOPES`
  (front+back). Core back: `ScopeCatalog` (built-in + legacy + canales), `GET /core/scopes` (admin-gated),
  **validación al guardar** user/API key. Core front: `ResourceEditor` puebla la select desde `/core/scopes`
  (con buscador), **sin enum propio** (los managers hacen fetch). Publicado: common 0.5.24, common-front 0.5.22,
  common-back 0.5.23; cascada free completa; Defender 0.0.9. **Se conceden `defender$*` desde User/API Security.**
  - Vestigial: `IChannel.getScopeCatalog` del **front** ya no se consume (el front tira del endpoint); se deja
    por simetría con el back. Quitarlo = cascada de common-front → diferido.
- **F2 ✅ HECHO (ver `plans/ops-trivy-scopes/PLAN.md`):** `ops` (0.2.15) y `trivy` (0.2.19) declaran sus
  scopes vía `getScopeCatalog()` (front+back, enums en su `common/`); **retirado `LEGACY_PLUGIN_SCOPES`** del
  core → `/core/scopes` sólo built-in + canales. Publicados + manifest. Back tests 61/0.
- **F3 ✅ HECHO (Defender, 0.1.1):** (a) `cluster` fuera del ladder (ya NO es admin); **super-rol =
  `admin`** (Kwirth) al tope, sobre `defender$poladmin`. (b) **D8**: `processDecisionCommand` y
  `processRemediationCommand` gateados por `defender$poledit` (enforce en el back). (c) e2e `09-rbac`
  reescrito al UI actual (⋮ con Help; items admin ocultos a no-admin) — se ejecuta con key no-admin real +
  `DEFENDER_E2E_NONADMIN=1`. Guía (Permissions) documenta el modelo. Verificado: el user `admin` lleva
  `cluster,admin` → pasa por el super-rol; un `cluster`-solo (dev) → no-admin.

## Extra hecho (fuera del plan original)
- **Homogeneización IdP** `connectorId`→`id`: el id PROPIO del conector pasa a `id` (como el resto de
  extensiones) en `IIdpConnector`, los 5 conectores, `IIdpConnectorInfo`, `idps/manifest.json` y el front
  `ManageIdps`; el FK `IIdpInstanceConfig.connectorId` se mantiene. common-back 0.5.23 + idps 0.1.3. Back tests 61/0.

## Notas / decisiones abiertas
- Nomenclatura confirmada: **`<plugin>$<scope>`**.
- Naming Defender: los actuales `pol*` gatean más que policies (también la config). Evaluar renombrar a
  `defender$view/edit/admin` en F3 (es DEV, sin keys de prod → renombrar es barato). En F1 se mantienen.
- Los scopes core built-in siguen en el core (no son de plugin).
