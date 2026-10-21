# PRD · Los DCE se cargan DESPUÉS de los providers, y no debería ser así

> **Estado**: hallazgo verificado, sin empezar · **Fecha**: 2026-10-21 · **Ámbito**: core (`back/src/index.ts`)

## El hallazgo

El core documenta, en `prepareRunningInstance()`, que los DCE van primero:

> *«DCEs go FIRST, before any manager that evaluates extension code (plan: plans/completed/dce/PRD.md, RF6):
> a consumer's back.js may ask for its DCE at module level, so the instance has to be in the registry
> before the senders, webhooks, toolsets, **providers**, IdP connectors and plugins load.»*

**No se cumple para los providers.** La secuencia real de arranque es:

| | |
|---|---|
| `setKubernetesClusterKwirthRequirements()` | carga los providers (`loadAll`) y los arranca (`startProvider`) |
| `prepareRunningInstance()` | crea el `DceManager` y carga los DCE |

y la primera se llama **antes** que la segunda. Así que un provider que pida su DCE al arrancar no lo
encuentra: `getDce()` lanza, y el consumidor cuidadoso lo trata como «el DCE no está instalado» — que es
exactamente el diagnóstico equivocado.

## Cómo apareció

`cloud-config` estrena un DCE (`aws-auth`) para resolver credenciales de AWS, y lo pedía en su
`startProvider`. No falló de forma visible: **simplemente no resolvía nada y el log se quedaba mudo**. Lo
encontró el QA del 2026-10-21 buscando un mensaje que nunca llegaba.

Es la peor forma de este fallo: no hay excepción que suba, no hay error en pantalla, y lo que el usuario ve
es una funcionalidad que no hace nada.

## Por qué no se arregló en el momento

No es mover dos líneas. El bloque que habría que adelantar no es solo la creación del manager: incluye
`setInstalledExtensionsSource()` (RF8) y `setConsumerResolver()` (RF9/RF11), y está protegido por un
`if (!dceManager)`. Adelantar solo la creación deja ese `if` en falso y **las otras dos dejan de
registrarse**, en silencio — el mismo tipo de fallo que este PRD viene a documentar.

Hay que mover el bloque entero y reordenar el arranque del core, con el riesgo de romper el arranque de
**todos** los productos. Merece su propio stream y su propio QA, no colarse a mitad de otro.

## Mientras tanto

`cloud-config` hace su primera resolución **diferida** diez segundos (`FIRST_REFRESH_DELAY_MS`), con el
porqué escrito junto a la constante. Funciona, pero es un apaño con un número mágico: cualquier consumidor
futuro de un DCE tropezará con lo mismo y tendrá que inventarse el suyo.

## Qué tendría que ser verdad al cerrarlo

- Un provider puede pedir su DCE en `startProvider()` y encontrarlo.
- Lo que hoy registra `prepareRunningInstance()` —RF8, RF9, RF11— se sigue registrando exactamente igual.
- `cloud-config` puede quitar su diferido y resolver en el arranque, que es donde corresponde.
- Y el invariante deja de estar solo en un comentario: si el orden se vuelve a romper, algo lo dice.
