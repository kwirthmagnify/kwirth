# Sugarless (provider) — histórico de métricas de test

> Registro **incremental** de la suite del provider, una fila por **CL9 / tag**. Se **añade** una fila
> arriba en cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`) en `providers/sugarless/`.
> - **Cobertura** = `COVERAGE=1 npm test` (Node `--experimental-test-coverage` con sourcemaps a
>   `src/`). ⚠️ Es sobre los módulos que el harness **carga**: el back del provider y sus tipos. El
>   diálogo React (`src/front/*.tsx`) **no entra** en esta medida — lo cubre el e2e.
> - **e2e** = `front/e2e/tests/sugarless.spec.ts`, compartido con el plugin (un solo spec cubre los dos
>   artefactos porque en la UI son una sola experiencia).

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-11 | `provider/sugarless@0.1.0` | **81** | **91,11% / 75,75% / 92,59%** | 1 / 4 (compartido con el plugin) | Primer cierre. Toda la suite con `fetcher` inyectado: **ningún test toca la red**. Los fixtures llevan la *forma* verificada de la API de LibreLinkUp con valores inventados — los reales son datos de salud y el repo es público. Lo que más casos concentra es el parseo del `FactoryTimestamp` (14 casos): es el punto donde un fallo no lanza, solo dibuja mal. Cubiertos también los cuatro requisitos de la API que se descubrieron chocando en cascada: versión de cliente caducada (`status 920`), cabecera `Account-Id` (SHA-256 del id de usuario), cuenta seguidora (lista vacía) y `glucoseMeasurement: null` como estado propio y no como error. |

## Pendiente sobre la propia suite

- **El diálogo no está medido.** El formulario de credenciales (máscara, ojo, botón Test, mensajes de
  error) lo cubre el e2e, pero no entra en el porcentaje. Los ~9 puntos que faltan hasta el 100% son
  casi todos `src/front/SugarlessConfigDialog.tsx`.
- **El redirect de región no tiene caso real.** Se prueba con un fixture, pero nunca se ha visto una
  respuesta `redirect` de verdad: la cuenta de prueba vive en `eu` y el host global la sirve.
