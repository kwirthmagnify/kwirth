# Sugarless (plugin) — histórico de métricas de test

> Registro **incremental** de la suite del plugin, una fila por **CL9 / tag**. Se **añade** una fila
> arriba en cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`) en `plugins/sugarless/`.
> - **Cobertura** = `COVERAGE=1 npm test`. ⚠️ Mide los módulos que el harness **carga**: el canal del
>   back, el reductor del front y los tipos comunes. El componente de la gráfica
>   (`SugarlessTabContent.tsx`) **no entra** — lo cubre el e2e.
> - **e2e** = `front/e2e/tests/sugarless.spec.ts`, compartido con el provider.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-11 | `plugin/sugarless@0.1.0` | **27** | **96,80% / 90,40% / 84,27%** | 1 / 4 (compartido con el provider) | Primer cierre. Primer canal **autónomo** del proyecto (`cluster:false` + `resourced:false` → view `none`), lo que obligó a cablear esa view en el core. El harness se reparte entre el canal del back (suscriptor por instancia, pausa sin desuscribir, limpieza al cerrar conexión) y el reductor del front, que es la única lógica real: distinguir los **cuatro estados sin curva** — sin configurar, esperando, sin lectura actual y error — porque lo que el usuario debe hacer es distinto en cada uno. |

## Pendiente sobre la propia suite

- **La gráfica no está medida.** Recharts, la banda objetivo y el color del valor según `isHigh`/`isLow`
  no entran en el porcentaje; el e2e llega hasta el estado "no arrancado" y no valida el dibujo.
- **Sin test del caso "arrancado y con curva" en e2e.** Exigiría una lectura real de Abbott durante la
  corrida, que no es determinista: el sensor emite cada ~15 minutos.
