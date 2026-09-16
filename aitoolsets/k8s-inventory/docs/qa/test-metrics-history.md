# k8s-inventory — histórico de métricas de test

> Registro **incremental** de la suite de tests del toolset, una fila por **CL9 / cierre de stream**. Se
> **añade** una fila arriba en cada cierre (punto 2 de la checklist CL9); **no se sobrescribe**.
>
> Junto a este fichero viven los dos PNG que se regeneran de él: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`, tests que **existen**).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` en `aitoolsets/k8s-inventory/` (`node --test`), contra
>   el `dist` construido y con clientes de Kubernetes **falsos**: la suite tiene que pasar en una máquina
>   sin cluster.
> - **Cobertura** = `COVERAGE=1 npm test` (Node `--experimental-test-coverage`) sobre `dist/back.js`, que
>   es lo que el core carga de verdad.
> - **e2e** = este toolset no tiene e2e propio: no pinta UI. Lo que se ve en pantalla —la tarjeta en el
>   gestor— lo cubre `front/e2e/tests/aitoolsets-manager.spec.ts`, del core.
> - ⚠️ **La llamada real al cluster NO está en el harness**, a propósito: la prueba `node verify.mjs
>   [namespace]`, que ejecuta las 8 tools contra el cluster activo. Se corre a mano al tocar el toolset, y
>   su resultado se anota en la columna de notas.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | verify.mjs | Notas |
|---|---|---|---|---|---|
| 2026-09-16 | Primer release: 8 tools de inventario sobre el contrato de capabilities | **13** ✅ | 86.89 % / 70.79 % / 69.57 % | **8/8 contra k3d-kwirth** | Segundo toolset de validación de S1, y el que ejercita el **contrato** (el primero, `playground`, solo probaba la mecánica). Obligó a cerrar el agujero que `playground` no podía ver: un `aitoolset` empaquetado **no tenía forma de llegar al cluster**, porque las 43 tools de hoy leen un `AsyncLocalStorage` privado de `common-ai` cuyo accesor no se exporta. Se resuelve con `execute(args, host)` y `buildToolHost(requires, context)`: el host se construye **según lo declarado**, y la fachada `IK8sCapability` presta 3 clientes + identidad del cluster + mapa de nodos, **no** los otros ~20 clientes de `ClusterInfo` ni `saToken`/`token`/`senders`/`webhooks` (`common-ai@0.5.54`, 5 casos nuevos en su harness). Resultado de la validación: **la fachada fue suficiente** para las 8 tools, ninguna necesitó nada fuera de su `requires`. Contra el cluster de dev: 18 namespaces, 34 services, 5 ingresses, y los refs de configuración de `coredns` con su `lastModified`. ⚠️ El typecheck cazó que `managedFields[].time` es **`Date`, no `string`**: ordenarlas con el `sort` por defecto las compara como texto (`'Apr' < 'Aug' < 'Dec'`) y devuelve la fecha equivocada — aquí se normaliza a ISO antes de ordenar, con su test. La copia original en `common-ai` conserva ese fallo y se corrige al migrarla en S3. |
