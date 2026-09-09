# Configurar triggers

**Config → Trigger** abre el editor. Es un diálogo a dos paneles: a la izquierda la lista de triggers y, bajo
ella, las versiones del trigger seleccionado; a la derecha el editor de la versión.

![El editor de triggers, con un trigger `artifact` sobre Deployment/ADDED](../images/triggers-dialog.png)

## Panel izquierdo

**Triggers.** Cada fila muestra el id y, debajo, el tipo y el kind (`artifact · Deployment`). Al final de la
fila hay dos iconos que aparecen al pasar el ratón: **clonar** y **borrar**.

Para crear uno, escribe un id en la caja de abajo y pulsa **+** (o Enter). Si la dejas vacía, se genera
`trigger-N`. El trigger nace como `artifact` sin kind y sin versiones.

Clonar un trigger copia **todo**, versiones incluidas, con el id sufijado `-copy`. Borrar pide confirmación.

**Versions.** Debajo, las versiones del trigger seleccionado. Cada una tiene un **interruptor**:

> ⚠️ Los interruptores son **excluyentes**. Al activar una versión, el resto se desactivan solas. Es
> intencionado: un trigger sólo puede tener un comportamiento activo.

Al clonar una versión, la copia nace **desactivada**, para que clonar nunca cambie lo que está pasando en
producción.

## Panel derecho: el editor de la versión

Los campos de la fila superior se dividen en dos grupos y **no se guardan igual**:

**Campos del trigger** — `Trigger ID`, `Trigger type`, `Kind`, `K8s Event`. Se aplican **según los tocas**,
sin necesidad de pulsar nada más.

**Campos de la versión** — todo lo demás. Sólo se guardan al pulsar **Add** / **Update**.

| Campo         | Notas                                                                                       |
|---------------|----------------------------------------------------------------------------------------------|
| `Kind`        | Sólo si el tipo es `artifact`. Lista cerrada con los kinds que escucha el canal.               |
| `K8s Event`   | Sólo si el tipo es `artifact`. *Any* deja pasar `ADDED`, `MODIFIED` y `DELETED`.               |
| `Spaces`      | Sólo si el tipo es `business`. Formato `space.type,space.type`. Hoy no filtra nada.            |
| `Version ID`  | Obligatorio: el botón de guardar está deshabilitado sin él. No puede repetirse en el trigger.  |
| `Description` | Texto libre que aparece bajo el id en la lista.                                                |
| `Action`      | `inform` / `cancel` / `repair`. Hoy sólo se comporta como `inform`.                             |
| `LLM`         | Uno de los LLMs configurados. Sin LLMs no llegas ni a abrir este diálogo.                       |
| `Steps`       | Máximo de pasos del agente. **0 o vacío ⇒ el backend usa 15**, no 0.                            |
| Tool selector | Las tools disponibles, con la casilla *auto*. Ver [Tools y pasos](../admin/03-tools.md).        |
| `System`      | El system prompt. Ignorado en triggers `business`.                                              |
| `Prompt`      | La plantilla. Deshabilitada cuando el tipo de prompt es `artifact`.                              |

## Botones

| Botón      | Qué hace                                                                  |
|------------|----------------------------------------------------------------------------|
| **New**    | Vacía el editor para escribir una versión nueva.                            |
| **Clone**  | Duplica la versión seleccionada, desactivada, con el id sufijado `-copy`.   |
| **Remove** | Borra la versión seleccionada, con confirmación.                            |
| **Add** / **Update** | Guarda. Dice *Add* si estás creando y *Update* si estás editando. |
| **OK**     | Cierra el diálogo y **envía la configuración al backend**.                   |
| **Cancel** | Descarta **todo** lo hecho en el diálogo.                                    |

> ⚠️ **Add/Update no persiste nada por sí solo.** Trabajas sobre una copia local de la configuración; hasta
> que no pulses **OK**, el backend no se entera. Si haces cinco cambios y cierras con **Cancel**, pierdes los
> cinco.

## Receta: auditar cada Deployment nuevo

1. **Config → Trigger**, escribe `pss-deployments` en la caja de la izquierda y pulsa **+**.
2. Con el trigger seleccionado: `Trigger type` = `artifact`, `Kind` = `Deployment`, `K8s Event` = `ADDED`.
3. `Version ID` = `v1`. `LLM` = el que tengas. `Steps` = 5.
4. Tools: marca `get_deployment_yaml` y `get_object_events`.
5. `System`:
   ```
   Eres un auditor de seguridad de Kubernetes. Evalúa el recurso contra los Pod Security
   Standards (baseline y restricted). Devuelve findings accionables, con evidencia concreta
   tomada del manifiesto. No inventes controles que no puedas justificar.
   ```
6. Tipo de prompt `jinja`, `Prompt`:
   ```jinja
   Audita el Deployment {{ metadata.name }} del namespace {{ metadata.namespace }}.

   Manifiesto:
   {{ spec | dump(2) }}
   ```
   ⚠️ Las dos últimas líneas no son decorativas: **son las que le pasan el recurso al modelo**. Sin ellas
   el modelo sólo recibe el nombre y el namespace, y te contestará pidiéndote el manifiesto. Ver
   [Triggers, versiones y prompts](03-concepts.md).
7. **Add** → activa el interruptor de `v1` → **OK**.
8. Despliega algo y míralo aparecer en la pestaña.

> Antes de activar un trigger sobre un kind con mucho movimiento (`Pod` + `MODIFIED` es el caso extremo),
> pásate por [Tools y pasos del agente](../admin/03-tools.md): ahí está la cuenta de lo que eso cuesta.

## Cómo probar sin activar nada

No hace falta desplegar recursos de mentira para afinar un prompt. El
[Playground](06-playground.md) ejecuta exactamente la misma tubería contra un payload que pegas a mano, y
cuando el resultado te convence lo exporta a un trigger real.
