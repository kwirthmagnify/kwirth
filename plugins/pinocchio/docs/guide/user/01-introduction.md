# Introducción y modelo mental

## Qué problema resuelve

Un clúster de Kubernetes acepta prácticamente cualquier cosa que le mandes. Un `Deployment` con
`privileged: true`, sin `resources`, con `latest` como tag y montando el socket de Docker se despliega sin
una sola queja. Los controles que lo evitarían —Pod Security Standards, políticas de admisión, un repaso
manual del YAML— o no están, o están en modo aviso, o nadie los lee.

Pinocchio ataca ese hueco por otro lado: **pone un modelo de lenguaje a leer cada recurso que nace o cambia**,
con las instrucciones que tú le has escrito, y con capacidad de **consultar el clúster** para contrastar lo
que ve.

## El modelo mental en una frase

> Un **trigger** es una regla del tipo *"cuando pase ESTO, pregúntale ESTO al modelo, dándole ESTAS
> herramientas"*.

Todo lo demás en Pinocchio existe para servir a esa frase:

- **Cuando pase ESTO** → el tipo de trigger (`artifact` o `business`), el `kind` y el evento de Kubernetes.
- **Pregúntale ESTO** → el *system* y el *prompt*, que es una plantilla jinja sobre el objeto que llegó.
- **Con ESTAS herramientas** → las *tools*, funciones reales que consultan el clúster, y los *steps*, cuántas
  veces puede encadenarlas antes de tener que responder.

## En qué se parece y en qué no a un chat de IA

|                       | Chat de IA                             | Pinocchio                                              |
|-----------------------|----------------------------------------|--------------------------------------------------------|
| Quién inicia          | Tú, escribiendo                        | Un evento del clúster o de negocio                      |
| Qué ve el modelo      | Lo que pegues en la ventana            | El objeto real + lo que consulte con sus tools          |
| Formato de salida     | Texto libre                            | JSON estructurado: findings, PSS, riesgo, informe       |
| Cuándo ocurre         | Cuando te acuerdas                     | Siempre, mientras el canal esté abierto                 |

La tercera fila es la que más cambia el resultado. Pinocchio no le pide al modelo "dime qué te parece":
le **impone un esquema de respuesta** con findings clasificados por severidad, categoría y confianza, un
nivel PSS actual y objetivo, un recuento por severidad y un informe en markdown. El modelo tiene que
rellenar esos campos, y por eso la salida se puede pintar, ordenar y comparar en vez de leerse a mano.

## Los dos tipos de trigger

**`artifact`** — el evento es un **objeto de Kubernetes**. Es el caso principal y el único que produce la
salida estructurada completa (findings, PSS, informe). Ejemplo: *"cada vez que se cree un Deployment,
audítalo contra los Pod Security Standards"*.

**`business`** — el evento es un **JSON arbitrario** que un sistema externo ha enviado por HTTP al provider
`business`. La salida es sólo un texto de respuesta. Ejemplo: *"cuando llegue un aviso de pico de pedidos,
mira las métricas del clúster y dime si aguantamos"*.

Los dos se configuran en el mismo diálogo y se prueban en el mismo Playground, pero se comportan de forma
bastante distinta. La diferencia está detallada en [Triggers, versiones y prompts](03-concepts.md).

## Qué NO es Pinocchio

- **No es un escáner de vulnerabilidades.** No mira CVEs de las imágenes. Para eso está el provider `trivy`.
- **No bloquea nada.** Los triggers tienen un campo *Action* con valores `inform`/`cancel`/`repair`, pero
  hoy sólo se comporta como `inform`: analiza y te lo cuenta. Ver [Límites conocidos](../admin/06-limits.md).
- **No recuerda.** Cada análisis es una llamada independiente. El modelo no ve los análisis anteriores.
- **No es gratis.** Cada disparo es una llamada de pago a tu proveedor de IA, y con tools activadas puede
  ser una cadena de varias. Ver [Tools y pasos del agente](../admin/03-tools.md).
