# Kwirth core — histórico de métricas de test

> Registro **incremental** de la suite de tests del **core** (back + front/e2e), una fila por **CL9 / cierre
> de stream**. Se **añade** una fila arriba en cada cierre (punto 2 de la checklist CL9); **no se
> sobrescribe** — es un histórico.
>
> Vive en `plans/` y no en `docs/`, porque `docs/` de la raíz es el **website público**: esto es material
> de desarrollo. Cada plugin de pago mantiene el suyo en `<plugin>/docs/plan/test-metrics-history.md`.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` en `back/` (`node --test`).
> - **Cobertura** = `COVERAGE=1 npm test` en `back/` (Node `--experimental-test-coverage` con sourcemaps a
>   `src/`). ⚠️ Es sobre los módulos que el harness **carga**: la lógica del back que los tests ejercitan.
>   El front (React) no entra en esta medida — lo cubre el e2e, no medido numéricamente.
> - **e2e** = nº de spec files (`front/e2e/tests/*.spec.ts`) y nº de casos `test()`. No cuenta los specs de
>   plugins privados ni el trabajo en curso sin commitear.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-09-06 | `login-censor@0.1.3`, `login-magnify@0.1.3`, `pack-censor@0.1.1` | **185** ✅ | 55.56 % / 72.46 % / 54.34 % | 9 specs · 21 casos | Primera fila del histórico del core. Stream de `extensionType`/`targetType` + secretos de marketplace + endurecimiento del login. Nuevos: `bundledExtensions` (9 casos), precedencia de docs por `(targetType, id)` (5), el guard de promesas y el cuelgue de `/login/password` (5). e2e nuevo `marketplace-secrets`; `marketplace-resolve` pasa a ser robusto a que haya marketplaces privados registrados. Se añade soporte de `COVERAGE=1` al runner del back, que no lo tenía. |
