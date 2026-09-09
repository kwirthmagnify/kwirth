# Plantillas de prompt

Pinocchio renderiza los prompts con **[nunjucks](https://mozilla.github.io/nunjucks/)** (la implementación
JavaScript de Jinja2), con `autoescape` activado. Esta página recoge qué variables hay disponibles en cada
ruta y cómo escribir un system que produzca findings útiles en vez de generalidades.

## Qué contexto recibe la plantilla

Esto es lo que más confusión genera, así que va primero y en tabla:

| Tipo de trigger | `promptType` | Contexto de render | El `system` |
|-----------------|--------------|--------------------|-------------|
| `artifact` | `jinja` | **El objeto de Kubernetes entero** | Se usa |
| `artifact` | `artifact` | *(no hay render: el prompt es `JSON.stringify(objeto)`)* | Se usa |
| `business` | cualquiera | **Vacío `{}`** | **Se ignora** |

El caso `business` merece repetirse: aunque rellenes el campo *Spaces*, **los datos del evento no llegan a la
plantilla**. Cualquier `{{ variable }}` se renderiza como cadena vacía. Un prompt `business` es, en la
práctica, texto fijo, y su valor está en las tools que le des al modelo, no en los datos que le pases.

## Variables disponibles en `artifact` + `jinja`

> ⚠️ **Antes de nada: el objeto es el contexto, no un adjunto.** El modelo recibe **sólo el texto
> renderizado**. Lo que la plantilla no interpole, no llega. Es el error más caro de esta página: escribes
> `Audita el Deployment {{ metadata.name }}`, el modelo recibe `Audita el Deployment api-gateway`, y te
> contesta que le pases el YAML. Si quieres que audite el recurso, **vuelca el recurso en la plantilla**
> (`{{ spec | dump(2) }}`) o usa `promptType: artifact`.

El contexto **es el objeto de Kubernetes tal cual**. No hay envoltorio ni prefijo: escribes las rutas del
manifiesto directamente.

```jinja
{{ kind }}                                    → "Deployment"
{{ apiVersion }}                              → "apps/v1"
{{ metadata.name }}                           → "api-gateway"
{{ metadata.namespace }}                      → "prod"
{{ metadata.labels.app }}                     → "gateway"
{{ metadata.creationTimestamp }}              → "2026-09-08T10:14:21Z"
{{ spec.replicas }}                           → 3
{{ spec.template.spec.serviceAccountName }}   → "gateway-sa"
{{ status.readyReplicas }}                    → 2
```

La estructura cambia según el kind: en un `Pod` los contenedores están en `spec.containers`, mientras que en
un `Deployment` o un `StatefulSet` están en `spec.template.spec.containers`. Escribe la plantilla para el
kind concreto del trigger.

Bucles y condicionales funcionan como en Jinja2:

```jinja
Contenedores del {{ kind }} {{ metadata.name }}:
{% for c in spec.template.spec.containers %}
- {{ c.name }} → {{ c.image }}
  {% if c.securityContext %}securityContext: {{ c.securityContext | dump }}{% else %}sin securityContext{% endif %}
  {% if not c.resources.limits %}⚠ sin resource limits{% endif %}
{% endfor %}
```

El filtro `| dump` serializa un subobjeto a JSON, y acepta un argumento de indentación (`{{ spec | dump(2) }}`).
Es la forma corta de meter un bloque entero del manifiesto en el prompt sin recorrerlo campo a campo — y,
como se explica arriba, **es lo que hace que el modelo vea de verdad el recurso**.

> ⚠️ `autoescape` está **activado**. Los caracteres `<`, `>`, `&`, `'` y `"` de los valores salen escapados
> como entidades HTML. Rara vez importa en un manifiesto de Kubernetes, pero si un valor te llega como
> `&quot;` en el prompt, esta es la razón. El filtro `| safe` lo desactiva para una expresión concreta.

## `artifact` puro: cuando no necesitas plantilla

Si lo que quieres es "toma el manifiesto entero y audítalo", no escribas plantilla: pon `promptType` en
`artifact`, deja el prompt vacío y mete toda la instrucción en el `system`. El prompt será el objeto
serializado completo.

Es más robusto que una plantilla —no se te olvida ningún campo, y funciona igual para cualquier kind— a
cambio de gastar más tokens de entrada.

## Escribir un buen `system`

El `system` es donde de verdad se decide la calidad del análisis. Cuatro cosas que funcionan:

**1. Dale un rol y un marco de referencia concreto.**

```
Eres un auditor de seguridad de Kubernetes. Evalúas recursos contra los Pod Security
Standards (baseline y restricted) y contra el CIS Kubernetes Benchmark.
```

**2. Exige evidencia, y prohíbe explícitamente inventar.**

```
Cada finding debe citar en `evidence` el fragmento literal del manifiesto que lo demuestra.
Si no puedes citar evidencia, NO emitas el finding: añádelo a `not_visible` en su lugar.
```

Esta instrucción es la que más reduce las alucinaciones. `not_visible` existe justo para darle al modelo una
salida honesta cuando no sabe algo.

**3. Dile qué hacer con las tools, no sólo que las tiene.**

```
Antes de concluir, usa `get_object_events` para comprobar si el recurso ya está fallando,
y `get_workload_config_refs` para ver qué ConfigMaps y Secrets consume.
```

Un modelo con tools y sin instrucciones sobre cuándo usarlas tiende a no usarlas, o a usarlas todas.

**4. Calibra la severidad, o te llegará todo como `critical`.**

```
critical = explotable ahora mismo para escapar del contenedor o acceder a datos de otros tenants.
high     = incumple `restricted` y amplía la superficie de ataque de forma significativa.
medium   = mala práctica con impacto acotado.
low      = higiene, sin impacto directo de seguridad.
```

## Un system completo, listo para copiar

```
Eres un auditor de seguridad de Kubernetes. Analizas un único recurso y devuelves un
informe estructurado.

REGLAS
- Evalúa contra los Pod Security Standards (baseline y restricted).
- Cada finding DEBE citar en `evidence` el fragmento literal del manifiesto que lo prueba.
- Si no puedes probar algo con evidencia, no lo afirmes: añádelo a `not_visible`.
- Lista en `controls_passed` los controles que el recurso SÍ cumple.
- Sé específico en `remediation`: el fragmento de YAML corregido, no un consejo genérico.

SEVERIDAD
- critical: explotable ahora para escapar del contenedor o alcanzar otros tenants.
- high: incumple `restricted` y amplía la superficie de ataque de forma significativa.
- medium: mala práctica con impacto acotado.
- low: higiene, sin impacto directo.

INFORME
En `report`, redacta en markdown un resumen para el equipo propietario del recurso:
qué es, qué riesgo tiene, qué hacer primero. Español, tono directo, sin relleno.
```

## Probar antes de activar

No afines prompts en producción. El [Playground](../user/06-playground.md) ejecuta la misma tubería contra un
payload pegado a mano y te enseña, en la pestaña **IN**, el prompt **ya renderizado** que recibió el modelo.
Es la forma más rápida de descubrir que `{{ spec.containers }}` estaba vacío porque el kind era un
`Deployment`.

Recuerda las dos diferencias del Playground al probar plantillas: en modo Business el **payload es el
prompt**, y en modo Artifact el `promptType` se deriva de si el campo Prompt está vacío o no.
