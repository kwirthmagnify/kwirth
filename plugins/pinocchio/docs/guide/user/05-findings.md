# Leer los findings

Un análisis de tipo `artifact` no devuelve texto libre: devuelve un **objeto con un esquema fijo** que el
modelo está obligado a rellenar. Esta página explica qué significa cada campo y —más importante— **cuánto
te puedes fiar de él**.

## La línea de cabecera

```
2026-09-08T10:14:22.145Z  ADDED Deployment 'api-gateway' in namespace 'prod'
                          [LLM:google/gemini-2.0-flash, IN:4821, OUT:1103]
```

- El evento que disparó el análisis.
- El **provider y el modelo** que lo produjeron. Útil cuando comparas versiones de un trigger.
- **IN / OUT** — tokens de entrada y de salida. Es tu factura. Si un trigger te sorprende en el coste, aquí
  está la respuesta.

## Los findings

Cada finding es un hallazgo concreto. En la lista sólo se ven la severidad y la descripción; el resto está a
un clic.

| Campo          | Valores                                                                                | Qué es |
|----------------|-----------------------------------------------------------------------------------------|--------|
| `level`        | `critical` · `high` · `medium` · `low`                                                    | Severidad. Ordena la lista. |
| `control_id`   | texto                                                                                     | Identificador del control que se incumple. |
| `control_name` | texto                                                                                     | Nombre legible del control. Es el título del diálogo de detalle. |
| `category`     | `privileges` · `identity` · `network` · `filesystem` · `supply_chain` · `resources` · `secrets` · `general` · `platform` | Familia del hallazgo. |
| `confidence`   | `low` · `medium` · `high`                                                                 | Cuánta seguridad dice tener **el modelo**. |
| `evidence`     | texto                                                                                     | El fragmento concreto que lo demuestra. |
| `impact`       | texto                                                                                     | Qué puede pasar si no se arregla. |
| `remediation`  | texto                                                                                     | Cómo arreglarlo. |
| `references`   | lista                                                                                     | Enlaces o identificadores de referencia. |
| `risk_score`   | número                                                                                    | Puntuación numérica que asigna el modelo. |

> **El campo que hay que mirar siempre es `evidence`.** Un finding con evidencia concreta ("el contenedor
> `api` declara `securityContext.privileged: true`") es verificable en dos segundos. Un finding sin
> evidencia, o con evidencia genérica, es una alucinación candidata. Cruza `confidence` con `evidence`
> antes de abrir un ticket.

En la lista, si la descripción contiene un fragmento entre ` **` y `** `, se pinta en negrita y subrayado.
Es un pequeño formateo heredado; no es markdown completo.

## La tira de resumen

Bajo los findings aparece una tira con el resumen del análisis. Se puede clicar para ver el detalle completo.

**PSS: `baseline` → `restricted`**

Los [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/) de
Kubernetes. `pss_current` es el nivel que el modelo considera que cumple el recurso **tal como está**;
`pss_target` es al que podría llegar aplicando las remediaciones. Los valores posibles son `privileged`,
`baseline`, `restricted` y `undefined`.

`privileged` es el nivel **más permisivo** (sin restricciones) y `restricted` el **más estricto**. Si ves
`pss_current: privileged`, es una mala noticia, no una buena.

**critical:0 high:2 medium:5 low:1**

El `score_summary`: recuento de findings por severidad, tal como lo cuenta el modelo.

**Riesgo global**

`global_risk`, la valoración de conjunto: `low`, `medium`, `high` o `critical`.

## El detalle del análisis

Al clicar la tira se abren tres cosas que no caben en la línea de resumen:

- **Controls passed** — los controles que el recurso **sí** cumple. Sirve para ver que el modelo ha hecho el
  repaso completo y no sólo ha buscado fallos.
- **Not visible** — los controles que el modelo **no ha podido evaluar** con la información que tenía. Este
  campo es oro: te dice dónde el análisis es incompleto y qué tool deberías haberle dado. Si `not_visible`
  está lleno, sube los `steps` o añade tools.
- **Next steps** — la lista de acciones recomendadas, en orden.

También muestra el **recurso** analizado (kind, nombre, namespace e imágenes) tal como lo identificó el
modelo. Compáralo con la línea de cabecera: si no coinciden, el modelo se ha confundido de objeto y el
análisis entero es sospechoso.

## El informe

El botón **Report** abre el campo `report`: un informe **en markdown** redactado por el modelo, pensado para
leerse como documento y no como lista. Se renderiza con el visor de markdown de kwirth.

Es la salida que puedes pegar en un ticket o en un correo. Los findings son para triar; el informe es para
explicar.

## Cuando algo falla

Si la llamada al modelo revienta, Pinocchio **no se calla**: publica un análisis con dos findings de nivel
`critical`, uno con el mensaje de error legible y otro con el error serializado entero. Verás algo como:

```
critical   Pinocchio analysis ended in error while processing 'events' when
           analyzing 'api-gateway' in namespace 'prod' [Kind:Deployment]
critical   {"name":"AI_APICallError","message":"...
```

Las causas más habituales: API key caducada, cuota agotada en el proveedor, o el modelo elegido no soporta
salida estructurada. El segundo finding, aunque sea feo, suele traer el mensaje exacto del proveedor.

## Análisis de triggers `business`

Los triggers de negocio **no producen findings**. Su salida es un único campo de texto que aparece en el
flujo como un mensaje normal, precedido de otro mensaje con el evento recibido. Nada de PSS, ni severidades,
ni informe.
