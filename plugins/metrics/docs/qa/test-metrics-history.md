# Kwirth Metrics — histórico de métricas de test

> Registro **incremental** de la suite de este plugin, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`).
> - **Cobertura** = `COVERAGE=1 npm test`. ⚠️ Es sobre los módulos que el harness **carga**: el back entero y
>   la lógica del canal del front (`MetricsChannel`). Las vistas React (`Chart`, `MenuChart`, `MetricsSetup`,
>   `MetricsTabContent`) salen al ~0 % porque no las renderiza el harness — las cubre el e2e, no medido
>   numéricamente.
> - **e2e** = nº de spec files en `e2e/tests/*.spec.ts` y nº de casos `test()`. Corre contra el dev vivo.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-10-11 | M1 — el canal `metrics` sale del core y pasa a plugin (`plugin/metrics@0.1.0`) | **21** ✅ (14 back · 7 front) | **32.60 % / 70.90 % / 60.92 %** | 3 specs · 10 casos ✅ (`01-channel` 5 · `02-magnify` 2 · `03-cluster-metrics` 3) | **Primera versión como plugin**: el código del canal del core (back y front) se muda tal cual, con cuatro cambios. **(1)** El back se suscribe al provider `metrics` del core declarándolo en `requirements.providers` y suelta la suscripción en un `cleanup()` que antes no existía (sin él, cada recarga en caliente dejaba una instancia huérfana recibiendo lecturas). **(2)** 🔴 El `process.exit(1)` cuando un pod está en un nodo que no aparece en la lectura **se va**: en el core tumbaba el back; dentro de un plugin habría tumbado Kwirth entero. Ahora se registra y se salta ese asset — test dedicado. **(3)** 🔴 **Bug heredado del core, arreglado: todas las métricas `*_mbps` salían multiplicadas por 100** — el redondeo estaba copiado del de CPU % (`*100*100/100`). Lo destapó el primer test con números redondos (1 Mbps exacto salía 100). Un `kube-system` en reposo pintaba «2,2 Mbps» que eran 22 kbps. **(4)** Magnify ya no construye a mano el estado del canal con sus tipos: el plugin lo entrega por `prepareExternalChannel`, el mismo hook que usan log y trivy; Magnify solo conserva una copia mínima de las formas para aplicar su formulario. **(5)** Las cuatro métricas de cluster (`kwirth_cluster_total_pods`, `_pods_percentage`, `_memory_percentage`, `_cpu_percentage`) son un único valor para todo el cluster y el canal las **repetía dentro de cada asset**: con dos namespaces y *merge* salían dos líneas idénticas, cada una con el nombre de un namespace que no tiene nada que ver (lo vio el usuario en el QA). Ahora viajan **una vez, en una serie propia llamada `Cluster`** (con mayúscula: ningún nombre de Kubernetes puede chocar con ella), y no esperan a la segunda lectura porque no son tasas. El *merge* del front cogía la lista de métricas **solo del primer asset**; ahora es la unión, y cada gráfica lleva solo las series que tienen su métrica. **(6)** Faltaba `admin` en la escala de scopes (el core avisaba `Inexistent scope 'admin' on channel 'metrics'`); queda como en el resto de plugins OSS. El harness es nuevo (runner de status, con las librerías de UI sustituidas por un stub para probar la lógica del front sin React). El e2e prueba la ruta real: el canal se ofrece con vista de recurso y no con la de cluster, el setup no deja arrancar sin métricas, las gráficas se llenan con **valores reales** del provider, pausa/reanuda/para, y Magnify abre metrics con las seis métricas por defecto del plugin. |
