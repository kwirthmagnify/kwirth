# Plan de trabajo: Guía de Usuario y Administrador de Kwirth

> Estado: **borrador para revisión**. No se ha escrito documentación todavía.
> Entregable: nueva sección **"User & Admin Guide"** dentro de la docu versionada.
> Idioma del entregable: **inglés** (coherente con el resto de `docs/0.5.287/`).
> Idioma de este plan: español.

---

## 0. TL;DR

Crear una **guía autocontenida orientada a "cómo se usa y se configura" Kwirth**, para dos audiencias (usuario final y administrador), más **manuales de usuario+admin de cada extensión**. Es intencionadamente **distinta en orientación** a la docu de referencia actual (que es exhaustiva y técnica): la guía es narrativa, por tareas, y **puede duplicar contenido** sin problema.

Vive en `docs/0.5.287/guide/` y se enlaza desde `_sidebar.md`. Se entrega en **4 fases**, parando tras cada una para revisión.

---

## 1. Decisiones cerradas (con el usuario)

- **Audiencia**: usuarios **y** administradores. Enfoque uso + configuración.
- **Autocontenida**: orientación distinta a la docu de referencia; se acepta duplicar.
- **Ubicación**: docu versionada, carpeta nueva `docs/0.5.287/guide/`.
- **Idioma**: inglés (docs); comentarios/plan en español.
- **Extensiones (Parte III)**: **ficha detallada usuario+admin por cada item** (**43 items**), agrupadas por tipo/familia, con **todo el detalle de uso y config** y **capturas**. **NO se incluyen**: daemons (se retiran de la docu) ni extensiones **de pago** (`defender`, `montag`, y conectores IdP pro) → esas irán en una futura **sección de marketplace**.
- **Troceado**: Fase 0 (andamiaje) · Fase 1 (Parte I usuario) · Fase 2 (Parte II admin) · Fase 3 (Parte III extensiones). **Parar tras cada fase.**

---

## 2. Inventario real de extensiones (repo, hoy)

| Familia | Items | Nota |
|---|---|---|
| **Plugins** (11) | alert, censor, echo, fileman, log, mirc, news, ops, pinocchio, topology, trivy | `mirc` NO estaba en la docu actual. **`defender` y `montag` son DE PAGO → NO se documentan aquí** (irán en la futura sección *marketplace*). Son los 11 del manifest publicado. |
| **Providers** (7) | kafka, otel, sample, syslog, tick, trivy, validating | `syslog`, `trivy` NO están en la docu actual |
| **Senders** (10) | composite, console, email-resend, email-smtp, file, ratelimit, regex, teams, tee, timed | `ratelimit` NO está en la docu actual |
| **Themes** (6) | avicii, depeche-mode, matrix, plexus, post-punk, sfy | Ninguno documentado |
| **IdPs** (5) | github-cloud, github-onprem, gitlab-cloud, gitlab-onprem, google | Ninguno documentado |
| **Homepages** (4) | avicii, clusterized, depeche-mode, matrix | Ninguno documentado |

La guía cubre **todas**, incluidas las no documentadas. Para las no documentadas se leerá su código/README/manifest antes de escribir.

---

## 3. Estructura de ficheros

```
docs/0.5.287/guide/
  index.md                          # portada + índice completo de la guía
  user/                             # Parte I — Guía de usuario
    01-introduction.md
    02-access.md
    03-ui-tour.md
    04-selecting-resources.md
    05-channels.md
    06-workspaces.md
    07-everyday-tasks.md
  admin/                            # Parte II — Guía de administrador
    01-deployment.md
    02-initial-config.md
    03-user-management.md
    04-security-and-permissions.md
    05-api-management.md
    06-cluster-management.md
    07-idp-integration.md
    08-extending-kwirth.md
  extensions/                       # Parte III — Manuales de extensiones
    index.md
    plugins/{alert,censor,echo,fileman,log,mirc,news,ops,pinocchio,topology,trivy}.md   # sin defender/montag (de pago)
    providers/{kafka,otel,sample,syslog,tick,trivy,validating}.md
    senders/{composite,console,email-resend,email-smtp,file,ratelimit,regex,teams,tee,timed}.md
    themes/{avicii,depeche-mode,matrix,plexus,post-punk,sfy}.md
    idps/{github-cloud,github-onprem,gitlab-cloud,gitlab-onprem,google}.md
    homepages/{avicii,clusterized,depeche-mode,matrix}.md
```

Imágenes: reutilizar las existentes en `docs/0.5.287/_media/` cuando apliquen; las **nuevas capturas las genero yo** (ver §8).

---

## 4. Contenido por capítulo

### Parte I — Guía de usuario
1. **Introduction** — qué es Kwirth, qué problemas resuelve, conceptos clave (cluster/instance, channels, workspaces) desde la óptica del usuario.
2. **Access** — cómo entrar: usuarios locales y login con IdP; primera pantalla; conceptos de sesión.
3. **UI tour** — layout: menú (burger), selector de recursos, pestañas/vistas, área de trabajo, homepages.
4. **Selecting what to observe** — clusters, namespaces, pods, contenedores; grupos y selecciones mixtas.
5. **Working with channels** — abrir un channel, controles comunes (setup/running), y uso rápido de cada channel de usuario.
6. **Workspaces** — montar pestañas, layout, guardar/reabrir, compartir. (Ojo terminología: se llaman *workspaces*, ya no *boards*.)
7. **Everyday tasks** — recetas paso a paso (ver logs de un pod, montar un dashboard de métricas, crear una alerta, etc.).

### Parte II — Guía de administrador
1. **Deployment** — resumen de opciones (kubectl/Helm/Docker/desktop) y primer arranque.
2. **Initial configuration** — cuenta admin, master key, ajustes base.
3. **User management** — crear/editar usuarios y roles.
4. **Security & permissions** — modelo de scopes y resources; qué ve cada rol.
5. **API management** — API keys, access keys, tipos de key, uso externo.
6. **Cluster management** — multi-cluster, consolidación.
7. **IdP integration** — configurar login externo (visión general; detalle por conector en Parte III).
8. **Extending Kwirth** — instalar/gestionar/configurar extensiones desde el front (visión general; detalle por item en Parte III).

### Parte III — Manuales de extensiones
Un fichero por item. **Plantilla común de ficha** (adaptada por familia):

```
# <emoji> <Nombre> (<familia>)
> meta card en 3 filas (blockquote con <br>): Type / Package / Icon(emoji)
## Overview            — qué es y para qué sirve (usuario)
## When to use it      — casos de uso
## User guide          — cómo se usa desde la UI (paso a paso)
## Admin guide         — instalar / activar / gestionar
## Configuration       — parámetros (tabla: nombre, tipo, requerido, descripción, ejemplo)
## Examples            — ejemplos de config (JSON, una propiedad por línea)
## Notes / limitations
```

Ajustar las secciones según la familia. Ojo: **casi todas las extensiones se configuran/gestionan desde la UI** (plugins, providers, senders, themes, idps, homepages tienen su gestión en el front — instalar, activar, configurar con su schema). Lo que varía es si tienen **UI de uso en runtime para el usuario final**:
  - **Plugins/channels**: sí, UI de uso en runtime (setup + running).
  - **Providers**: configuración/gestión desde la UI (admin); no son un "channel" que el usuario abra, alimentan datos.
  - **Senders**: configuración desde la UI (admin), se usan como destino de otras funciones.
  - **Themes/Homepages**: se seleccionan/activan desde la UI; sección centrada en activación + preview.
  - **IdPs**: configuración desde la UI (admin); efecto de usuario = pantalla de login.

---

## 5. Fases (cada una un MVP entregable) y checks

### Fase 0 — Andamiaje
- Crear `guide/index.md` (portada + TOC completo navegable).
- Añadir entrada **"User & Admin Guide"** en `_sidebar.md` (al menos el índice; se expande por fase).
- **MVP**: se puede navegar a la guía y ver su índice.
- **Checks**: levantar `docs/serve` (o `serve.cmd`), navegar a `#/0.5.287/guide/index`, ver la portada y que el enlace del sidebar funciona. Sin 404 en el índice.

### Fase 1 — Parte I (usuario)
- Escribir caps. 1–7 de `user/`.
- Añadir sus entradas al sidebar bajo la guía.
- **MVP**: un usuario nuevo puede leer la guía y usar Kwirth de principio a fin.
- **Checks**: navegar cada página, sin 404, imágenes cargan, enlaces internos OK.

### Fase 2 — Parte II (admin)
- Escribir caps. 1–8 de `admin/`.
- Añadir entradas al sidebar.
- **MVP**: un admin puede desplegar, configurar seguridad, usuarios, API, clusters e IdP.
- **Checks**: navegación y enlaces OK.

### Fase 3 — Parte III (extensiones)
- `extensions/index.md` + ficha por cada item (**43**; sin daemons ni extensiones de pago).
- Antes de escribir cada item no documentado, leer su código/README/manifest.
- Añadir entradas al sidebar (agrupadas por familia).
- **MVP**: cada extensión tiene su manual usuario+admin.
- **Checks**: navegación y enlaces OK; toda extensión del inventario tiene ficha.

> Nota: aunque el troceado acordado es 0/1/2/3, dentro de la Fase 3 (43 ficheros; sin daemons ni de pago) se harán paradas de control por familia para revisión.

> **Marketplace (futuro)**: se creará más adelante una sección aparte para extensiones **de pago** (defender, montag, conectores IdP pro). No mezclar con la guía open-source.

> **Credenciales del dev**: se pasan fuera de banda (conversación / script en scratchpad). **Nunca** en el repo, ni en este plan, ni en la docu, ni en memoria persistente.

---

## 6. Regresión (no romper lo existente)

- **No tocar** los `.md` de referencia existentes ni las versiones anteriores (`0.5.40`, etc.).
- Solo se **añade** una sección al `_sidebar.md` de `0.5.287`; no reordenar lo demás.
- Reutilizar imágenes de `_media/` sin moverlas ni renombrarlas.
- El selector de versiones y la navegación existente deben seguir funcionando igual.

---

## 7. Convenciones de estilo

- Markdown estilo docsify (como el resto de `0.5.287/`): `#`/`##`, tablas, bloques ```; enlaces relativos tipo `(channels/log)`.
- JSON en código: **una propiedad por línea**.
- Tono directo, por tareas, con "how to". Capturas reales (pedir al usuario las que falten).
- **Nivel de detalle alto**: explicaciones detalladas, no telegráficas. En **temas delicados** (permisos/scopes, API/access keys, IdP, borrado, seguridad) **añadir ejemplos concretos** (paso a paso, valores de ejemplo, casos).
- No inventar parámetros: los de config se extraen del schema/código real de cada extensión.

---

## 7bis. Backlog de peticiones (aplicar al cerrar sección / cuando encaje)

- [x] **Cap. 5 (Access keys vs API keys)**: explicar **qué se puede hacer con una access key** (todo acceso a la API la requiere; la usan apps externas; **es lo que se pega en Manage cluster list para añadir un cluster remoto**) ✅.
- [x] **Cap. 6 (Add a remote cluster)**: explicar el **funcionamiento multicluster** — cada **tab** muestra info de **un cluster distinto**; se pueden mezclar tabs de varios clusters en la misma vista/workspace ✅.

- [x] **Cap. 4 (resource selector)**: ampliar la parte de **selección de cluster** — explicar qué significa **inCluster** y **inDesktop**, y **enlazar con Cluster management** (Parte II / cap. admin de clusters). ✅ hecho.
- [x] **Cap. 4 (resource selector)**: ejemplos con **otros views/scopes además de namespace** (controller, pod, container); significado de cada uno, **por qué se ven unas cosas u otras** y **cómo funcionan las selecciones** (cascada, multi-select, habilitación). ✅ hecho (leído `ResourceSelector.tsx` + capturas select-controller/pod/container + tabla de habilitación por view).

---

- [x] **Cap. 3 (User management)**: corregir "un solo admin" → admin es scope, puede haber varios ✅ (caps. 2 y 3).
- [x] **Cap. 3 (Create a user)**: explicar cómo se **crean/editan los scopes/resources** (editor: Resource List, NEW/SAVE/REMOVE, multi-select scopes, filtros, doble SAVE) ✅.
- [x] **Cap. 3 (User management)**: usuarios IdP en detalle (campo IdP, sin password, id=email verificado, binding, ejemplo) ✅ + captura `admin-user-idp`.
- [x] **Parte III (extensiones) + cap. 8 (Extending)**: managers explicados en **cap. 8** ✅ (Installed/Available, Card/List, Settings ⚙, BROWSE, install/uninstall, dev mode, campos/botones). Detalle por familia en Parte III ✅ (plugins ×13, providers ×7, senders ×10, themes ×6, IdPs ×5, homepages ×4 — ficha por ítem con capturas).

## 7ter. Iconos → emoji por extensión (usar en título/meta de cada ficha)

Cada plugin trae `icon` (MUI) en el manifest; en la docu se usa un **emoji equivalente** (no el nombre). Mapa channels:
`log 📄 (Subject)` · `metrics 📊` · `alert ⚠️ (Warning)` · `ops 🖥️ (Terminal)` · `fileman 📁 (FolderCopyTwoTone)` · `trivy 🛡️ (VerifiedUser)` · `magnify 🔍` · `topology 🌳 (AccountTree)` · `pinocchio ✨ (AutoFixHigh)` · `censor 🔎 (ManageSearch)` · `mirc 💬 (Forum)` · `news 📰 (Newspaper)` · `echo 🧪 (Science)`.
Para providers/senders/themes/idps/homepages: usar un emoji representativo del tipo/función (revisar su manifest/icon si lo trae).

## 8. Capturas de pantalla (Playwright)

- **Yo genero las capturas** con **Playwright** (no hay tool de navegador nativo en el entorno; se instala y se scriptea).
- **Yo decido qué capturar**: al escribir cada sección identifico la pantalla/estado que la ilustra, la capturo y la enlazo. El usuario revisa al parar cada fase.
- Los PNG se guardan en `docs/0.5.287/_media/guide/` (subcarpeta nueva para no mezclar con las existentes).
- **Modo de captura: dark, sin theme aplicado.** Excepción: las capturas de la sección de **themes** (ahí sí se muestra cada theme).
- **Margen para animaciones**: antes de CADA screenshot, esperar unos ms (settle delay ~600ms + `waitForTimeout` tras navegaciones/clicks) para que terminen transiciones/animaciones y no salga la UI a medio pintar. Helper `shot()` en `lib.mjs`.
- **Sesión no persistida en localStorage**: solo `kwirth.mode` vive ahí; el login es en memoria/sessionStorage → cada script hace login. Dark se fuerza con `addInitScript(localStorage.setItem('kwirth.mode','dark'))`.
- **El entorno dev lo levanta el usuario bajo demanda**: cuando lo necesite (capturas / probar), **se lo pido** y él lo arranca. No intentar levantarlo por mi cuenta.
- **Requisitos del usuario** (una vez):
  - URL del entorno dev **alcanzable desde aquí** (p.ej. `http://localhost:PORT`) y app levantada.
  - Credenciales **admin** con **login local** (el IdP OAuth externo no se automatiza bien).
  - Que el cluster de dev tenga **datos reales** (pods/logs/métricas) para que las pantallas no salgan vacías.
- **Riesgos**: frágil (layout/timings/datos), e implica exponer datos del cluster de dev en la docu → el usuario confirma que es aceptable.
- Método: script Playwright que hace login una vez, reutiliza sesión y navega a cada ruta/estado a capturar; se itera por fase.
```
