# Ops — histórico de métricas de test

> Registro **incremental** de la suite de tests, una fila por **CL9 / tag**. Se **añade** una fila arriba en
> cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests unitarios. Ops **no tiene harness** todavía: su lógica es del front (terminales,
>   sockets de shell) y la cubre el e2e.
> - **Cobertura** = sin harness, no hay cobertura medida (`—`).
> - **e2e** = nº de spec files (`e2e/tests/*.spec.ts`) y nº de casos `test()`. Corren contra la app levantada
>   (`e2e/.creds.json`, gitignorado), aislados del build del plugin.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-11-16 | `plugin/ops@0.2.28` — **los sockets de shell se cierran** | 0 (no hay harness) | — | 2 / 3 | 🐛 Cazado en el QA de **IRIA Ianus** (Fase 5, stream 5.1′), cuyo panel lista las sesiones WebSocket vivas: cerrar una shell (la papelera de la lista XTerm) o quitar el tab de Ops dejaba **abierto** el socket de la shell (`?challenge=`), y con él el `exec` en el back, hasta recargar la página. `deleteSession` y `destroyTerminal` solo hacían `term.dispose()`, y `stopChannel` no tocaba los terminales. Ahora `TerminalManager.destroyTerminal` cierra también el socket, `closeAll()` cierra todos, `deleteSession` usa `destroyTerminal` y `stopChannel` llama a `closeAll()`. Entra además lo que ops tenía pendiente: **Object info** pinta el JSON con `JsonBlock` de `kwirth-common-front` (0.5.75) en vez de `react-json-view-lite` (dependencia y su CSS fuera), y `common-back` a ^0.6.18. e2e: `01-object-info` (el JSON coloreado) y `02-shell-sockets` nuevo — abrir una shell en `local-path-provisioner` y comprobar que su socket se cierra al cerrar la shell y al quitar el tab. Se escuchaba el `close` **después** del clic y, si llegaba antes, la espera no acababa: se escucha antes. 3 ✅ |
