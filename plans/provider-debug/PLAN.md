# Provider Debug — plan

Plugin de canal para inspeccionar qué emite realmente un provider. Público, open-source,
`plugins/provider-debug`, id `provider-debug`.

## Decisiones cerradas

- **Es un plugin de canal**, no un provider. Vive en `plugins/`, no en `providers/`.
- **Solo depura providers en marcha.** `requirements.providers` va vacío a propósito: el core solo
  instancia y arranca los providers que algún canal declara ahí ([back/src/index.ts:1629](../../back/src/index.ts#L1629)),
  y un depurador no debe abrir sockets de syslog ni conexiones de Kafka como efecto colateral de
  estar instalado. El precio es que un provider instalado sin consumidor no aparece.
- **Un subscriber proxy por instancia.** Los providers indexan sus subscribers por el objeto, así
  que si el canal se registrase a sí mismo solo cabría una suscripción y un payload por provider.
- **Sin senders, sin export, sin inyección de eventos sintéticos.** Descartado: `IProvider` no
  expone ninguna API de inyección, habría que ampliar el contrato.
- **Canal cluster-scoped** (`cluster: true`, `resourced: false`): los providers no cuelgan de un pod.

## F1 — back completo · HECHO (v0.1.0)

- Esqueleto del plugin, build/watch/tsconfig, README.
- Canal back: catálogo de providers vivos, suscripción con payload libre, entrega de eventos en
  crudo, pausa/continuación, teardown y reconexión.
- Front **provisional**: provider tecleado a mano, volcado plano de JSON. Desechable.
- 26 tests unit (`npm test`) + 6 e2e Playwright (`e2e/`), todos en verde.
- Registrado en `back/kwirth-dev.json`.

## F2 — front de verdad · EN CURSO

### Hecho

1. **Select de providers** en el setup, poblada y marcada desde el primer momento (sin arrancar el
   canal) desde una **única fuente**: `GET /core/providers`, que se amplió para ser la vista
   completa del core — instalados **más** los de core (`events`, `metrics`), cada uno con `running`
   y con `subscriptionHelp`. Los que nadie arranca salen marcados `not running`.
   - El objetivo del cambio es que **haya un solo sitio que tocar** cuando el contrato evolucione.
     Antes hubo una versión con tres fuentes y los dos providers de core hardcodeados en el
     plugin: descartada, precisamente por repartir la verdad en varios sitios.
   - Descartado también un endpoint de canal: se montan en `/${ri.id}/channel/...` y el front solo
     conoce el `ri` preguntándolo por el websocket de la pestaña, que no existe hasta el primer
     Start. Es por eso que trivy dice *"start the channel at least once"*.
   - El catálogo por websocket sigue existiendo (alimenta los chips de la pestaña y hace de red si
     el endpoint no responde), pero ya no es quien manda en la Select.
   - ⚠️ `ProviderManagerDialog` filtra las entradas `core`: no son extensiones y no se instalan ni
     se desinstalan, así que no pintan nada en el gestor.
2. **JSON colapsable** por evento: Accordion MUI con resumen de una línea (timestamp, provider,
   claves de primer nivel) y volcado coloreado por tipo con la paleta MUI (`JsonBlock.tsx`).
   - Descartado CodeMirror (disponible como global del core): pesa demasiado para instanciarlo por
     cada entrada del buffer, y aquí solo hay que leer. Además no hay `lang-json` en los globals,
     solo `lang-yaml`.
3. **Botón de limpiar** el buffer en la barra del canal.
4. **Línea informativa** de canal sin arrancar, al estilo de `MagnifyTabContent.tsx:1416`.

5. **`getSubscriptionHelp()` en `IProvider`**, OPCIONAL por decisión explícita: quien escriba un
   provider la añade si quiere. Devuelve `{ usage, example, fields? }`. El canal la recoge al
   construir el catálogo (llamada defensiva: no implementarla, devolver basura o reventar no puede
   tumbar el catálogo del resto), y el setup pinta el texto, un botón USE EXAMPLE y, si hay
   `fields`, un formulario generado en vez de JSON a mano.
   - Declarada en DOS sitios, porque hay dos `IProvider`: `common-back/src/IProvider.ts` (providers
     de extensión) y `back/src/providers/IProvider.ts` (providers de core). Espejos.
   - Implementada en `events` (usage + example + fields) y `metrics` (usage + example, sin fields
     porque su payload no se usa). Los 10 providers de extensión siguen sin ella: es opcional.
   - ⚠️ Los providers de extensión consumen `kwirth-common-back` por npm, así que hasta que se
     publique no pueden importar `IProviderSubscriptionHelp`. Implementarla **estructuralmente**
     (sin importar el tipo) compila hoy y queda comprobada el día que se publique.
   - No confundir con el `schema` que un provider exporta desde `back.js`: ese describe la config
     del propio provider (`configure`/`configRouter`), no el payload de suscripción.

6. **Buscador en la barra** con contador `posición/total` (a la izquierda del campo, siempre
   visible, `0/0` si no hay búsqueda), anterior/siguiente (también Enter y Shift+Enter, con vuelta
   al principio) y limpiar. Resalta en vídeo inverso TODAS las coincidencias del JSON desplegado y
   tiñe el timestamp de los eventos que casan, para saber qué tarjetas abrir sin abrirlas.
   - Salta a la **coincidencia**, no a la tarjeta: con miles de líneas, centrar la tarjeta dejaba
     el resultado fuera de pantalla (las marcas llevan `data-pd-hit`).
   - El texto buscable de cada evento se serializa una vez y se cachea en un `WeakMap`: con 200
     eventos de `metrics`, re-stringificar por tecla costaba megas por render.
7. **Hitos del arranque como chips**, en vez de dos líneas de texto sueltas: `config` (el core
   acepta la config de instancia) y `subscribed` (el canal confirma la suscripción), verdes al
   ocurrir, a la derecha de la fila de providers.
   - Se detectan por **estructura**, no por su literal: el core responde al start config con un
     `IInstanceConfigResponse`, que NO lleva `level`; este canal manda `ISignalMessage` **con**
     `level` (INFO al suscribirse, ERROR en los fallos). Los errores siguen leyéndose como texto.
8. **Cards sin animación al abrir/cerrar.** Se quitó `Accordion`: el `Collapse` de MUI ignora el
   `timeout: 0` de `slotProps.transition` y escribe su transición en estilo **inline**, que gana a
   cualquier clase. Ahora el detalle se renderiza a mano (`{open && ...}`), así que no hay
   transición que quitar y una tarjeta plegada **no tiene DOM**.
   - La expansión pasa a ser controlada y por **referencia al evento**, no por índice (buffer
     circular).

### Pendiente

9. Autoscroll con anclaje al fondo.
10. Plantillas de payload por provider conocido — el matiz de `events` (sin `kinds` no entrega
   nada) es justo lo que hace falta que la UI enseñe sola.
11. `modifiable: true` para cambiar de provider sin parar y rearrancar la instancia.
12. Export del buffer a JSON.

### Nota de mantenimiento

`ProviderApi` mezcla `listInstalled()` con las claves de `registeredProviders` para poder ofrecer
también los providers de core. **Ese merge es temporal**: cuando `events` y `metrics` se
externalicen como providers de verdad (petición del usuario, pendiente de hueco — ya son
`IProvider`, así que es mecánico), aparecerán en `listInstalled()` como cualquier otro y el bloque
sobra, junto con el filtro de `core` en `ProviderManagerDialog`. Hay un TODO en el código.

## e2e — coste

El suite comparte UNA página para todo el fichero (`describe.configure({ mode: 'serial' })` +
`beforeAll`). El coste dominante era recargar la SPA contra el dev server de react-scripts, no
Playwright: con una página por test el suite tardaba 6,4 min; compartiéndola, 1,7 min con más
tests. Si se añaden tests, mantener el orden: van de "sin arrancar" a "arrancado", y el que limpia
el buffer va el último.

## V2 / descartado por ahora

- **Alcanzar providers instalados pero no arrancados.** Requeriría o un comodín `providers: ['*']`
  en el core (arrancaría todo, con efectos colaterales), o una API `IProviderAccess` nueva en
  `IBackChannelObject` con `list()` + `ensureStarted(id)`. Descartado en F1 por no tocar el core.
- Reenvío de eventos a un sender.
- Export del buffer a JSON.
