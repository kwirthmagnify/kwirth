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
- **F1 (MVP):** tipo `IExtensionScope` en common; `build.mjs` de **Defender** inyecta `scopes` en su manifest;
  core lo lee/expone en `IPluginMeta`; `ResourceEditor` añade dinámicamente los scopes de plugins instalados
  (manteniendo el enum core built-in y, de momento, los `ops$/trivy$` hardcodeados). Resultado: se pueden
  conceder `defender$*` desde User/API Security con etiquetas. **Entregable usable.**
- **F2:** migrar `ops` y `trivy` a declarar sus scopes en su manifest; **retirar** los hardcodeados del enum.
- **F3:** revisar el modelo de Defender: (a) `cluster` = acceso total por diseño de Kwirth (god) → decidir si
  Defender-admin debe requerir `defender$poladmin` explícito aun con `cluster`; (b) **RBAC de decisiones (D8)**:
  hoy `processDecisionCommand` NO comprueba scope → gatear accept/assign/remediation por un scope (¿`poledit`?).
  (c) activar el e2e negativo `09-rbac`.

## Notas / decisiones abiertas
- Nomenclatura confirmada: **`<plugin>$<scope>`**.
- Naming Defender: los actuales `pol*` gatean más que policies (también la config). Evaluar renombrar a
  `defender$view/edit/admin` en F3 (es DEV, sin keys de prod → renombrar es barato). En F1 se mantienen.
- Los scopes core built-in siguen en el core (no son de plugin).
