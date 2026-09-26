# common-sql — histórico de métricas de test

> Registro **incremental** de la suite de la librería, una fila por **CL9**. Se **añade** una fila arriba en
> cada cierre (punto 2 de la checklist CL9); **no se sobrescribe** — es un histórico.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test`) en `common-sql/`. El de integración con
>   Postgres se **salta** cuando no hay servidor configurado, de ahí que pasen menos de los que hay.
> - **Cobertura** = ⚠️ **no se mide todavía**: `tests/run.mjs` de este paquete no tiene modo `COVERAGE`, a
>   diferencia del de `common-cloud` y los providers. Se anota como *n/m* en vez de inventar una cifra.
> - **e2e** = esta librería no tiene suite e2e propia: no tiene UI ni proceso. Lo que la ejercita de verdad
>   es el e2e de sus consumidores. Se anota como `0 / 0`.

| Fecha | Versión | Harness | Cobertura (líneas / ramas / funcs) | e2e (specs / casos) | Notas |
|---|---|---|---|---|---|
| 2026-09-26 | `0.2.0` | **10** (9 + 1 saltado) | n/m | 0 / 0 | **Los errores de base de datos pasan a decir algo, y knex deja de escribir por su cuenta.** Salió de una traza real: `Acquire connection error: AggregateError`, sin prefijo de componente, y un `listIncidents failed: AggregateError` en Agora. La causa de fondo era Postgres inalcanzable, pero lo que estaba roto era el **diagnóstico**. 🔴 **`describeError()`**: cuando un host resuelve a varias direcciones, Node las prueba todas y al fallar todas lanza un **`AggregateError` cuyo `toString()` es literalmente «AggregateError»** — el código, la dirección y el puerto viven dentro de `.errors` y nadie los sacaba. Ahora sale `AggregateError: ECONNREFUSED 10.43.1.5:5432 · ECONNREFUSED ::1:5432`, **deduplicado**, porque probar seis direcciones y fallar en todas no son seis noticias sino una. Importa más de lo que parece: con la base de datos caída **toda** llamada falla a la vez y todas dicen lo mismo, así que es exactamente el momento en el que menos información había. 🔴 **`setSqlLogger()`**: knex trae su **propio** logger y escribe **directo a `console`**; sus mensajes salían sin hora, sin nivel y sin decir de qué extensión eran. Ahora el consumidor le pasa el suyo —el mismo patrón que `setLogger()` en providers y canales— y por defecto sigue la consola, así que nadie tiene que cambiar nada para seguir funcionando. **5 tests nuevos**, todos sobre el formateo, que es donde está la lógica: el desempaquetado del `AggregateError`, la deduplicación, el caso de error normal con código y destino, la caída al mensaje cuando no hay código, y que no revienta con basura. ⚠️ El arreglo vive **aquí y no en Agora** porque es esta librería la que construye knex: así lo hereda todo consumidor (Iter, Excubitor…) en vez de arreglarse uno y dejar rotos los demás. |
