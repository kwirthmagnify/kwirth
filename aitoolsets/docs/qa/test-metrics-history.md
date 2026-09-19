# AI toolsets — histórico de métricas de test

> Registro **incremental** de la suite de tests de los `aitoolset`, una fila por **CL9 / cierre de
> stream**. Se **añade** una fila arriba en cada cierre (punto 2 de la checklist CL9); **no se
> sobrescribe**.
>
> ⚠️ **Un histórico para toda la familia, no uno por paquete.** La regla general es que cada extensión
> lleve el suyo en `<ext>/docs/qa/`, y aquí se hace una excepción a conciencia: los ocho toolsets son
> **un solo entregable** (el reparto de las 43), se construyen y se cierran juntos, y siete ficheros con
> una fila cada uno no dirían más que esta tabla — dirían lo mismo, siete veces. Si algún toolset toma
> vida propia (versiones sueltas, su propio ciclo), se le saca su histórico entonces.
>
> **Cómo se obtiene cada dato:**
> - **Harness** = suma de `npm test` en cada `aitoolsets/<toolset>/`. Corren contra el `dist` construido
>   —lo mismo que carga el core— con clientes de Kubernetes **falsos**: la suite tiene que pasar en una
>   máquina sin cluster.
> - **Cobertura** = `node --test --experimental-test-coverage` sobre los `dist/back.js`, los ocho en **una
>   sola corrida** (desde `aitoolsets/`: `node --test --experimental-test-coverage */tests/*.test.mjs`). La
>   columna es el **agregado de la familia**, no la media de ocho porcentajes. Junto a este fichero viven
>   los dos PNG que se regeneran de él (`test-metrics-coverage.png` y `test-metrics-tests.png`).
> - **e2e** = no tienen e2e propio: no pintan UI. Lo que se ve en pantalla lo cubre el core
>   (`aitoolsets-manager.spec.ts` para el gestor, `pinocchio-toolsets.spec.ts` para el consumo).
> - ⚠️ **La llamada real al cluster NO está en el harness**, a propósito: la prueba `node verify.mjs` de
>   cada paquete de lectura, a mano. **`k8s-ops` no tiene `verify.mjs`** y no es un olvido: verificarlo
>   contra un cluster de verdad significaría borrar pods y parar nodos.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | Paquetes | verify.mjs | Notas |
|---|---|---|---|---|---|---|
| 2026-09-19 | `compare_revisions`: de "se encareció" a "lo encareció este commit" | **113** ✅ | 90.94 % / 73.26 % / 89.09 % | 8 (6 públicos + 2 privados); `source-repos` sube a **0.2.0** | sin novedad (⚠️ `source-repos` no tiene `verify.mjs`: verificarlo de verdad exige un token y un repo con dos revisiones, así que su red está toda en el harness, con `fetch` falso) | Segunda tool del toolset de pago, y la que cierra la otra mitad de la cadena: `get_source_file` mira **una** revisión, `compare_revisions` compara **dos** y dice **qué entró**. Pedida por Modus para su hallazgo H3 (regresión de eficiencia): la revisión culpable ya la identifica sin IA con `rollout_history` + digests, y esta tool es la que permite EXPLICAR el diff (F8). El harness del paquete pasa de 11 a **26** y su cobertura propia es **100 % / 80 % / 100 %**. Decisiones que se ven en los tests: **`includePatch` por defecto `false`** —para atribuir una regresión a un deploy basta la lista de commits, y el patch es lo que encarece la llamada—, y **tres topes con aviso** (100 commits · 100 ficheros · 20 000 caracteres de patch **en total**, no por fichero) que marcan `truncated`: una respuesta recortada en silencio es peor que una cara, porque el modelo concluye sobre lo que no llegó a ver. ⚠️ Lo caro de normalizar fue **GitLab**: llama `diffs` a los ficheros, `id` al sha, **no devuelve contadores de línea** (hay que contarlos del propio diff, saltando las cabeceras `+++`/`---` que no son líneas del fichero) y deja `new_path` **vacío en un borrado**, donde el nombre que vale es el viejo. En GitHub la trampa es la contraria a la de `get_source_file`: aquí **los tres puntos del rango NO se codifican** (son la sintaxis del endpoint), pero cada ref sí, o una rama `release/1.0` rompe la URL. ⚠️ **Se añade a esta tabla la columna de cobertura**, que hasta ahora no estaba: es el **agregado de los ocho paquetes en una sola corrida**, no la media de ocho números; la fila anterior se queda sin dato porque no se midió entonces, y el PNG la salta. |
| 2026-09-17 | S3: las 43 repartidas en ocho paquetes | **98** ✅ | — | 8 publicados (6 públicos + 2 privados) | inventory **8/8**, observability **3/3**, describe **12/12** contra k3d-kwirth | Reparto: `k8s-inventory` 7 · `k8s-describe` 12 · `k8s-observability` 3 · `k8s-metrics` 7 · `k8s-secrets` 3 · `k8s-ops` 8 · `source-repos` 1 · `playground` 2 = **43**. Todos escritos contra el contrato nuevo (`execute(args, host)`), con `defineTool` infiriendo los argumentos desde el propio esquema — sin eso, 30 tools serían 30 sitios con `String(args.namespace)` donde el compilador no ayuda. **`k8s-ops` y `source-repos` son PRIVADOS** (Nexus, scope `@iriaoperae`); el resto, npm público. ⚠️ Dos correcciones sobre lo que decía el plan: **`get_space_data` estaba en el paquete equivocado** (lo cazó el usuario) — describe UN namespace, así que es de `k8s-describe`, no de `k8s-inventory`; y **`get_secret` NO devuelve los valores**, solo las claves, así que el sensible de verdad es `get_configmap`, que sí devuelve los datos en crudo. ⚠️ Gotcha caro: un toolset construido contra un `common-ai` **más nuevo que el que sirve el core** no carga (`defineTool is not a function`), y el síntoma es una tarjeta instalada **sin contador de tools** — que es justo lo que la decisión de sacar el `toolCount` del registro venía a enseñar. |
