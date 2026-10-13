# Kwirth Events provider — histórico de métricas de test

> Registro **incremental** de la suite de este provider, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`; uno corre contra
>   un API server falso con watches reales).
> - **Cobertura** = `COVERAGE=1 npm test`, mapeada a `src/` con sourcemaps.
> - **e2e** = nº de spec files en `e2e/tests/*.spec.ts` y nº de casos `test()`. Corre contra el dev vivo.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-10-13 | E1 — el provider `events` sale del core y pasa a extensión (`provider/events@0.1.0`) | **13** ✅ (6 mudados del core · 7 nuevos) | **61.94 % / 88.71 % / 58.62 %** | 2 specs · 6 casos ✅ (`02-magnify-without-provider` se salta solo si el provider está; lanzado sin él: ✅) | **Primera versión como extensión.** Lo que cambia respecto al provider del core: **(1)** los watches de Kubernetes pasan a `createResourceWatcher` de `kwirth-common-back` 0.6.2 —en runtime, la copia del core—, así que el bundle pesa **13,7 KB** y no lleva client-node; el helper además **para de verdad** (guarda el `AbortController` que devuelve `Watch` 1.x: el `watch.abort()` del core no existía y no cortaba nada). **(2)** La lectura de eventos se ofrece por el contrato nuevo `getData` (Magnify la usa por el handle) y por HTTP en el `configRouter`, tras el accessKey (`/core/providerconfig/events`); `getEvents` sigue mientras excubitor lo llame. **(3)** Sin Kubernetes detrás avisa una vez y no arranca. **(4)** Un suscriptor que lanza ya no corta el reparto a los demás. **Descubierto y conservado tal cual**: cada CRD que aparece se añade a **todos** los suscriptores, así que todos reciben las instancias de los CRDs nuevos aunque no las pidieran (anotado en el plan). El e2e prueba el *push* de verdad: un ConfigMap creado con `kubectl` aparece en la lista de Magnify sin recargar y desaparece al borrarlo. |
