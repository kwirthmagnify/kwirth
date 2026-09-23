# Sender `file` — histórico de métricas de test

> Registro **incremental** de la suite, una fila por **CL9 / tag**. Se **añade** una fila arriba en cada
> cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`).
> - **Cobertura** = `COVERAGE=1 npm test`.
> - **e2e** = un sender no tiene interfaz propia: se ejerce desde el core (diálogo de configuración) y
>   desde quien le manda. El camino de **lotes** lo alimenta montag.

| Fecha | Versión / tag | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-23 | `sender/file@0.1.13` | **14** | **86.72% / 81.97% / 80.00%** | — / QA manual | **Primer sender con `sendBatch`, y primeros tests de un sender.** Un lote se escribe en **una sola** llamada en vez de una por línea: quien reenvía log entrega cien líneas de golpe, y una syscall por línea convierte un append barato en lo más lento de la cadena. El formato es **idéntico** al de `send` —hay un test que compara los dos ficheros— porque un lote es un detalle de rendimiento, no otro formato. Opción nueva **`origin`**, apagada por defecto para no cambiar la forma de los ficheros que ya existen: con ella cada línea lleva `[namespace/pod/container]`, o el `service` cuando la línea no viene de ningún pod (un evento de negocio, un servidor sin contenedores). ⚠️ La trampa que cubren los tests: **la rotación cuenta el lote entero**, porque escribir cien líneas de una vez no puede saltarse el `maxLines`; y `send` y `sendBatch` comparten el contador, así que mezclarlos no descuadra la rotación. **Dos cosas más que destapó el QA en vivo**: cada línea lleva ahora **su propia hora** —la del productor, que viaja en `origin.timestamp`— porque al entregar por lotes el sender fechaba al escribir y quince líneas salían con el mismo instante, perdiendo justo lo que hace útil un log; y el esquema **declara sus valores por defecto** (`timestamps` y `levels` a `true`), porque el diálogo pintaba un interruptor apagado para un campo que se comportaba como encendido. |
