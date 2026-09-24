# Kwirth Status — histórico de métricas de test

> Registro **incremental** de la suite de este plugin, una fila por **CL9 / cierre de stream**. Se **añade**
> una fila arriba en cada cierre; **no se sobrescribe** — es un histórico.
>
> Junto a este fichero viven los dos PNG que se regeneran de él en cada cierre: evolución de la cobertura
> (`test-metrics-coverage.png`) y tamaño de la suite (`test-metrics-tests.png`).
>
> **Cómo se obtiene cada dato:**
> - **Harness** = nº de tests que reporta `npm test` (`node --test` sobre `tests/**/*.test.ts`).
> - **Cobertura** = `COVERAGE=1 npm test`. ⚠️ Es sobre los módulos que el harness **carga**; el front no
>   entra en esta medida — lo cubre el e2e, no medido numéricamente.
> - **e2e** = nº de spec files en `e2e/tests/*.spec.ts` y nº de casos `test()`.

| Fecha | Cierre | Harness | Cobertura (líneas / ramas / funcs) | e2e | Notas |
|---|---|---|---|---|---|
| 2026-09-24 | S1 — el inventario con su estado real | **12** ✅ | **88.49 % / 91.80 % / 66.67 %** | 1 spec · 9 casos | Nace el plugin. Canal de solo lectura que enseña **qué tiene Kwirth montado y por qué está como está**: providers, pluviders, senders y webhooks, con el estado derivado de `ClusterInfo` y la columna **Why**, que es la que justifica la pantalla —un *"not running"* a secas es lo que ya había—. **Coste cero con la pestaña cerrada**: no hay temporizador, ni suscripción, ni recolección; se lee lo que ya está en memoria cuando alguien abre, y el refresco es manual. Dos invariantes fijados con test **en los dos lados**, harness y e2e, porque son los que se romperían sin querer: **(1)** nada se marca como *activo* ni *ocioso* —distinguirlos exige preguntar quién consume, y ese contrato llega en S2; quien lea "ocioso" irá a desinstalar algo—, y **(2)** de los webhooks **no sale la URL**, porque `getUrl()` la devuelve con el token dentro y esta pantalla la puede estar mirando quien no debe conocerlo. Scope mínimo `cluster`: el inventario completo no es para cualquiera. ⚠️ Dos tropiezos del primer arranque, los dos clásicos de plugin: el icono `MonitorHeartOutlined` **no está en el barrel** de `common-front` y llegaba `undefined` —se cambió a `Hub`, y los iconos se importan del barrel, no de `@mui/icons-material`—, y `channelObject.data` **lo crea el canal** en `initChannel`, no el core. El `ChannelErrorBoundary` del core se comportó: la pestaña mostró el fallo con su mensaje y el resto de Kwirth siguió funcionando. Y un tercero que sacó el QA: **la tabla no scrolleaba** —con 20 componentes las últimas filas eran inalcanzables— porque el contenedor que el core da al contenido de una pestaña **no tiene altura definida** y un `height: 100%` no resuelve a nada; se pasó al patrón de los demás canales (medir dónde empieza la caja y darle el resto del viewport) y se fijó con un caso e2e que comprueba que la última fila se alcanza. |
