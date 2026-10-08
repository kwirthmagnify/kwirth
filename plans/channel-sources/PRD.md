# Channel sources — qué canales pueden vivir aquí

> **Estado:** borrador, pendiente de validar. Sin código.
> **Origen:** la sesión de QA del 2026-10-08 sobre el Kwirth desplegado en **AWS ECS**.

## 1. El problema, con el caso que lo destapó

En un Kwirth **sin Kubernetes** el selector de recursos ofrece **todos** los canales instalados, incluidos
los que no pueden funcionar ahí. No hay nada que lo impida: nadie cruza lo que un canal necesita con lo que
la instalación tiene.

Hoy se ve en el ECS real: el desplegable ofrece `magnify`, `metrics` o `trivy`, que sin API de Kubernetes no
tienen de dónde sacar un solo dato. El usuario los elige, arranca el canal y se encuentra una pantalla
vacía — o un error, según el canal. **La ausencia de capacidad no se distingue de la ausencia de datos**,
que es el mismo patrón que llevamos todo M14 persiguiendo en Excubitor.

Y al revés también falla, aunque hoy nos beneficie: **Excubitor aparece por casualidad**, no porque alguien
haya decidido que puede. Si mañana se activara un filtro ingenuo, desaparecería.

## 2. Lo que ya existe y por qué no basta

Hay **dos** mecanismos en el contrato, y ninguno responde la pregunta.

**`cluster` / `resourced`** dicen **cómo se invoca** un canal: cluster-wide, por recurso, o de ninguna
manera. De ahí sale `isAutonomous()` en el `ResourceSelector`:

```ts
const isAutonomous = (channel) => !channel.cluster && !channel.resourced
```

*"No necesita nada del cluster"*. Es el mecanismo actual para "funciona sin Kubernetes", y **Excubitor no
cumple**: declara `cluster: true` porque se invoca cluster-wide. Sus datos vienen de los conectores cloud y
de los escaneos de registro, no de la API de Kubernetes.

**`sources: string[]`** dice **de dónde salen los recursos** con los que el canal trabaja. Existe en
`BackChannelData` desde siempre, los 24 canales lo declaran… y **no lo lee nadie**: su único uso es pintarlo
en `ManageClusters`. Además, los 24 declaran `[kubernetes]`, y varios mienten — `galaga`, `spectrum`,
`sugarless` o `echo` no tocan un cluster en su vida.

El hueco es que **son dos ejes ortogonales metidos en uno**:

| Pregunta | Quién la responde |
|---|---|
| **Cómo** se invoca: cluster-wide, por recurso, ninguna | `cluster` / `resourced` |
| **Qué** necesita detrás: Kubernetes, nada, otra cosa | `sources` — existe, pero está muerto |

Excubitor es justo la combinación que hoy no se puede expresar: **se invoca cluster-wide y no necesita
Kubernetes**.

## 3. Decisiones

### D1 · `sources` es un **array**, no un booleano ✅ *(validado por el usuario, 2026-10-08)*

Se descartó `requiresCluster: boolean`, más directo de leer, porque cierra la puerta al tercer origen. Con
el array, el día que exista otro tipo de cluster se añade un valor y ya:

```ts
sources: [EClusterType.KUBERNETES, EClusterType.NONE, EClusterType.OTRO]
```

**Semántica**: el conjunto de orígenes de recursos con los que el canal **puede vivir**. `NONE` en la lista
significa *"también sé funcionar sin ninguno"*, consistente con lo que `EClusterType.NONE` ya significa en
`Channel.ts` — *"de ningún sitio"* como respuesta honesta, no como fallo.

Se asume que leer `sources: [kubernetes, none]` chirría un poco, porque suena a *"orígenes: ninguno"*. Se
acepta a cambio de la extensibilidad.

### D2 · **ECS NO entra en `EClusterType`** ✅ *(validado por el usuario, 2026-10-08)*

La propuesta inicial era declarar Excubitor como soportando *"2 tipos de cluster: KUBERNETES y ECS"*. La
recomendación es **no hacerlo**, por dos motivos:

1. **Contradice el diseño ya escrito** en `Channel.ts`, que retiró DOCKER con este argumento literal:
   *"Docker sigue siendo un sitio donde **correr** —eso lo dice `EExecutionEnvironment`— pero no una fuente
   de recursos"*. ECS es exactamente el mismo caso.
2. **Rompe el caso real**: Excubitor inventaría tareas de ECS **también desde un k3d**, porque esa capacidad
   se la da el conector cloud, no el sitio donde vive. Si ECS fuese un tipo de cluster, un Kwirth en
   Kubernetes mirando una cuenta AWS tendría que declararse de dos tipos a la vez, y el tipo dejaría de
   describir la instalación.

🔴 **Si se decide lo contrario**, hay que repasar las guardas del *sin cluster* entregadas hoy
(`cc6821ad`, `8633383e`), que preguntan `clusterType === NONE` y pasarían a `!== KUBERNETES`.

### D3 · Alcance de las declaraciones ✅ *(validado por el usuario, 2026-10-08: opción A)*

Son **24 canales** los que declaran `sources`, y cada plugin de pago tocado arrastra su bump, publish,
manifest y tag. Ahí está el coste, no en el código.

- **Opción A (recomendada)**: declarar solo **`excubitor` y `status`**, que son los que corren en el ECS, y
  el resto cuando se toque cada uno por otro motivo. El filtro funciona igual: lo que no declare `NONE`
  simplemente no sale en un Kwirth sin cluster, **que es la verdad** mientras nadie diga lo contrario.
- **Opción B**: revisar los 24 de una vez. Más coherente de golpe, pero son ~20 bbpm encadenados.

### D4 · Un canal incompatible **se muestra DESHABILITADO**, no se oculta ✅ *(validado por el usuario, 2026-10-08, vía UC1)*

Se descartó ocultarlo. Un canal que el usuario ha instalado y no aparece es un misterio; deshabilitado con
su motivo es una respuesta. Es el mismo criterio que venimos aplicando en todo M14: **no borrar
información, explicarla**.

El motivo va en un tooltip, y tiene que nombrar **lo que falta**, no lo que sobra: *"needs a Kubernetes
cluster"*, no *"not compatible"*.

## 3b. Casos de uso

### UC1 · Kwirth en ECS con tres canales instalados

Un Kwirth en ECS (`clusterType: none`) con **Excubitor**, **Status** y **Logs** instalados.

Lo que declara cada uno:

| canal | `sources` | en el selector |
|---|---|---|
| `excubitor` | `[kubernetes, none]` | **seleccionable** |
| `status` | `[kubernetes, none]` | **seleccionable** |
| `log` | `[kubernetes]` | **deshabilitado** |

En el selector se ven **los tres**. **Excubitor** y **Status** son seleccionables: ninguno necesita la API
de Kubernetes. **Logs** aparece **deshabilitado**, porque solo sabe leer logs de pods y ahí no hay pods —
con su tooltip diciendo exactamente eso.

El filtro no adivina nada: sale de cruzar el `sources` declarado por el canal con el `clusterType` del
cluster seleccionado. `log` se deshabilita porque **declara `[kubernetes]` y nada más**, no porque alguien
haya puesto su nombre en una lista.

> Lo que este caso fija, y conviene no perder de vista: Logs no está deshabilitado por *"ser de Kubernetes"*
> en abstracto, sino porque **su fuente de datos no existe aquí**. Esa es la pregunta que `sources`
> responde, y por eso la respuesta correcta es deshabilitar y explicar, no esconder.

### D5 · Se filtra por el **cluster seleccionado**, no por la instalación ✅

Igual que las guardas de hoy. Un k3d añadido a la lista de clusters sigue ofreciendo todo cuando se
selecciona: es **ese** cluster el que tiene algo que enseñar, no el que hospeda a Kwirth.

### D6 · Un canal que no declare nada: **permisivo** ✅ *(validado por el usuario, 2026-10-08)*

¿`sources` vacío o ausente = "vale para todo" o = "no vale para nada"? Permisivo evita romper extensiones de
terceros; estricto obliga a declarar. **Recomendación: permisivo**, porque el contrato lleva años sin que
nadie lo lea y romper instalaciones ajenas por una limpieza interna no compensa.

## 4. Fuera de alcance

- No se toca `cluster` / `resourced` ni `isAutonomous()`: siguen decidiendo **cómo** se invoca un canal, y
  el filtro por vista que ya existe (`channelFitsView`) se queda como está.
- No se añaden tipos de cluster nuevos (ver D2).
- No se filtra nada en el **back**: un canal incompatible que alguien arranque a mano por API sigue
  arrancando. Esto es ergonomía del selector, no seguridad.

## 5. Riesgo principal

🔴 **El orden no es negociable: primero las declaraciones, después el filtro.** Los 24 canales declaran hoy
`[kubernetes]`. Si el filtro entra antes, un Kwirth sin cluster se queda **sin un solo canal**, empezando por
Excubitor, que es el que se está usando ahí.

## 6. Cómo se sabrá que está bien

1. **UC1 reproducido**: en el Kwirth de ECS, los tres canales se ven; Excubitor y Status seleccionables,
   Logs deshabilitado con su tooltip.
2. Añadir un cluster Kubernetes a la lista y seleccionarlo **rehabilita todos** los canales, sin recargar.
3. Un canal de terceros que no declare `sources` sigue seleccionable (D6).
4. Ningún canal **desaparece** de la lista por este cambio: los que no encajan se deshabilitan.
