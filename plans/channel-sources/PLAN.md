# Channel sources — PLAN

> **Estado (2026-10-08):** **VIVO, con los tres streams entregados.** ✅ **S1** (core: el selector cruza
> `sources` con el tipo del cluster seleccionado), ✅ **S2** (`excubitor` y `status` declaran
> `[kubernetes, none]`) y ✅ **S3** (publicados `excubitor@0.2.17` al Nexus privado y `status@0.7.2` a npm
> público, con sus manifests).
>
> 🔴 **NO cerrado**: falta el **QA manual de UC1** contra el Kwirth de ECS, que exige buildear el core y
> reinstalar los dos plugins. Y queda el backlog de declaraciones de los otros 22 canales, que es
> deliberado (D3).
>
> PRD en [`PRD.md`](./PRD.md), con las seis decisiones validadas y el caso **UC1**.
> Documento **vivo y append-only**: el estado de cada stream se actualiza, nunca se borra.

## Por qué, en una línea

En un Kwirth sin Kubernetes el selector ofrecía **todos** los canales, incluidos los que allí solo pueden
pintar una pantalla vacía — y ofrecía Excubitor **por casualidad**, no por decisión. `sources` existía en el
contrato desde siempre y **no lo leía nadie**.

## Streams

| # | Qué | Estado |
|---|---|---|
| **S1** | **Core**: el `ResourceSelector` cruza `channel.sources` con el `clusterType` del cluster **seleccionado**. El que no encaja se **deshabilita** con el motivo al lado. Permisivo si el canal no declara nada | ✅ **HECHO** (2026-10-08) |
| **S2** | **Declaraciones**: `excubitor` y `status` pasan a `[kubernetes, none]` | ✅ **HECHO** (2026-10-08) |
| **S3** | **bbpm** de los dos plugins: bump, build, publish, manifest y tag. Excubitor al **Nexus privado**; Status a **npm público** | ✅ **HECHO** (2026-10-08): `excubitor@0.2.17` + `docs/excubitor@0.2.17`, `status@0.7.2` (con README en el tarball) |

### S1 · Lo que entró en el core

Dos funciones puras en [`ResourceSelector.tsx`](../../front/src/components/home/ResourceSelector.tsx), junto
a las que ya filtraban por vista:

- `channelFitsCluster(channel, clusterType)` — permisivo si `sources` está vacío o ausente (D6).
- `channelNeeds(channel)` — el texto de lo que falta: *"needs kubernetes"*. Nombra **lo que necesita**, no
  que es "incompatible", que no le dice nada al que lo lee.

🔴 **Desviación del PRD, y por qué.** El PRD decía *tooltip*; está puesto como **texto en línea** dentro del
item. MUI desactiva los eventos de puntero en un `MenuItem` deshabilitado, así que un tooltip **no llegaría
a dispararse nunca**. Y, al margen del impedimento técnico, un motivo que hay que descubrir pasando el ratón
por encima es medio motivo: en un desplegable, escrito al lado se lee sin buscarlo.

### S2 · Lo que declaran ahora

| canal | `sources` | por qué |
|---|---|---|
| `excubitor` | `[kubernetes, none]` | se invoca cluster-wide pero **no necesita la API de Kubernetes**: sus hallazgos vienen de los conectores cloud y de los escaneos de registro. Validado en el ECS real |
| `status` | `[kubernetes, none]` | lo que enseña es **el propio Kwirth** —providers, plugins, extensiones, rutas, el log del core—, nada de lo cual sale de Kubernetes. En un Kwirth sobre ECS es de los pocos sitios donde mirar qué pasa |

## Backlog

> Append-only.

- **Los otros 22 canales siguen declarando `[kubernetes]`, y varios mienten.** `galaga`, `spectrum`,
  `sugarless`, `echo`, `mirc` o `news` no tocan un cluster en su vida y deberían declarar `none`. No se
  tocan ahora por **decisión explícita** (D3, opción A): cada plugin de pago arrastra su bbpm entero, y
  encadenar veinte en una tarde no compensa. Se corrige **cuando se toque cada uno por otro motivo**.
  Mientras tanto el filtro no miente: lo que no declara `none` no sale en un Kwirth sin cluster, que es la
  verdad hasta que su autor diga lo contrario.
- **`magnify`, `metrics`, `trivy`, `fileman`, `log`, `ops`, `nettools` se quedan como están**: necesitan
  Kubernetes de verdad y `[kubernetes]` es correcto. No hay nada que hacer con ellos — se listan para que
  nadie los "arregle" por error.
- **El back no filtra nada.** Un canal incompatible que alguien arranque por API sigue arrancando. Esto es
  ergonomía del selector, no seguridad (fuera de alcance en el PRD). Si algún día hace falta, el sitio es
  `processStartInstanceConfig`.
- **Falta decidir qué pasa con un canal ya abierto** cuando se cambia a un cluster donde no encaja: hoy la
  pestaña sigue viva y el filtro solo actúa al crear una nueva. Puede estar bien (es lo menos invasivo) o
  puede ser otro caso de "datos de algo que no está". Sin caso real todavía.
- **`sources` sigue siendo `string[]` en `BackChannelData`**, no `EClusterType[]`. Tiparlo obligaría a
  recompilar las extensiones; se deja para cuando toque un cambio mayor del contrato.

## Lo que hay que ver para darlo por bueno

1. **UC1**: en el Kwirth de ECS, los tres canales visibles; Excubitor y Status seleccionables, `log`
   deshabilitado con *"needs kubernetes"* al lado.
2. Añadir un cluster Kubernetes, seleccionarlo, y **todos** vuelven a estar seleccionables sin recargar.
3. Un canal que no declare `sources` sigue seleccionable.
4. **Ninguno desaparece** de la lista.
