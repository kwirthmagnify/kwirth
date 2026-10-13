# Kwirth Metrics provider — histórico de métricas de test

> Registro **incremental** de la suite de este provider, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`, con `fetch`
>   sustituido por un kubelet falso).
> - **Cobertura** = `COVERAGE=1 npm test`, mapeada a `src/` con sourcemaps.
> - **e2e** = nº de spec files en `e2e/tests/*.spec.ts` y nº de casos `test()`. Corre contra el dev vivo. Los
>   consumidores (canal metrics, Magnify embebido, métricas de cluster) se prueban además con el e2e del
>   plugin metrics.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-10-12 | P1 — el provider `metrics` sale del core y pasa a extensión (`provider/metrics@0.1.0`) | **11** ✅ (3 de "sin token", mudados del core · 8 nuevos) | **74.20 % / 73.38 % / 81.82 %** | 2 specs · 8 casos ✅ (`02-magnify-without-provider` se salta solo si el provider está instalado; lanzado sin él: ✅) — y el e2e del plugin metrics, 10/10 contra esta extensión | **Primera versión como extensión.** El código del provider del core se muda con estos cambios: **(1)** sus rutas (lista de métricas y uso del cluster) pasan del router público `/provider/metrics` —protegido con la validación de claves del core, que una extensión no puede importar— al **`configRouter`**, que el core monta detrás del accessKey en `/core/providerconfig/metrics`; el front prueba la ruta nueva y, si recibe 404, la antigua (clusters remotos con versiones anteriores). La ruta `/config` (GET/POST del intervalo) no se porta: nadie la llamaba y el intervalo vive en los settings del core. **(2)** Ya no escribe `clusterInfo.vcpus`/`memory`: el core los calcula de `node.status.capacity`. **(3)** El intervalo lo lee de `kwirthData.metricsInterval` en cada tick —el core escribe ahí al guardar los settings, y es el mismo objeto que recibe el provider— y se reprograma si cambia, sin contrato nuevo. **(4)** Sin Kubernetes detrás (`clusterType !== 'kubernetes'`) avisa una vez y no arranca: antes era el core quien lo desregistraba. **(5)** 🔴 **Bug latente del desktop**: con `@kubernetes/client-node` 1.x `applyToFetchOptions` **devuelve** las opciones, y el core las tiraba, así que la lectura salía sin credenciales; ahora se usan — test dedicado. **(6)** Un suscriptor que lanza ya no corta el reparto a los demás. **(7)** Magnify (core) avisa en su overview cuando el provider no está instalado, en vez de pintar tres gráficas vacías: su respuesta a `USAGE` lleva `metricsProvider`. `express` se resuelve contra la instancia del core (`global.__kwirth_back__.express`), como host-metrics: el bundle pesa 30 KB. |
