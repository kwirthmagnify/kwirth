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
>   plugins privados (`tests/private/`, excluidos por `testIgnore`) ni el trabajo en curso sin commitear.

## Pendiente sobre la propia suite

- **`help-popup` falla en la corrida completa y pasa en solitario.** Contaminación entre tests: algún spec
  anterior deja estado en la aplicación (el DOM de Kwirth es compartido entre pestañas y diálogos). No es
  un fallo del producto, pero enmascara los de verdad — un rojo que aparece según el orden no sirve de
  señal. Hace falta que cada spec deje la aplicación como la encontró.
- **La suite completa tarda ~15 minutos**, y Playwright no vuelca nada hasta el final, así que no se puede
  seguir el avance. Demasiado para usarla dentro del ciclo de trabajo: hoy se acaba corriendo por grupos.
- **Ningún spec regenera capturas sin querer.** `capture-*.spec.ts` escribe en `docs/_media/guide`, así que
  una corrida completa modifica imágenes de la guía aunque nadie lo haya pedido — pasó en este CL9 y hubo
  que revertir cuatro. Deberían quedar fuera de la corrida por defecto, como los privados.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-09-07 | GitHub/Azure DevOps · webhooks en packs · captura redactada | **198** ✅ | 55.89 % / 73.13 % / 55.14 % | 11 specs · 23 casos | `common@0.5.45`. Nuevos: cabeceras de manifest por host (7 casos, GitHub verificado contra la API real) y `extensionDeps` (7). Dos tests que asumían una configuración concreta del entorno pasan a comprobar la rama que toque: `loginExt=anonymous` (el rojo aceptado el 2026-09-04, ya diagnosticado — el login está instalado *sin configurar*, y caer al formulario es lo correcto) y la procedencia en `marketplace-resolve`. `testIgnore: '**/private/**'`: los e2e de plugins de pago ya no se cuelan en una corrida del core. ⚠️ La suite completa tarda ~15 min. |
| 2026-09-06 | `login-censor@0.1.3`, `login-magnify@0.1.3`, `pack-censor@0.1.1` | **185** ✅ | 55.56 % / 72.46 % / 54.34 % | 9 specs · 21 casos | Primera fila del histórico del core. Stream de `extensionType`/`targetType` + secretos de marketplace + endurecimiento del login. Nuevos: `bundledExtensions` (9 casos), precedencia de docs por `(targetType, id)` (5), el guard de promesas y el cuelgue de `/login/password` (5). e2e nuevo `marketplace-secrets`; `marketplace-resolve` pasa a ser robusto a que haya marketplaces privados registrados. Se añade soporte de `COVERAGE=1` al runner del back, que no lo tenía. |
