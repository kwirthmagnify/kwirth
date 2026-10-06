# Planes del core

Qué hay aquí y en qué estado está, sin tener que abrir veinte ficheros.

Un plan **no se borra nunca**: es append-only, y su valor cuando el trabajo termina es contar **por qué**
se hizo así — las decisiones, lo que se descartó y los sustos que aparecieron por el camino. Lo que un plan
*no* cuenta es cómo funciona el producto hoy: para eso están el código y la guía. Si un plan contradice lo
que ves en el producto, **gana el producto**.

Por eso cada uno abre con una cabecera de estado. **Al cerrar o mover un tema, se actualiza esa cabecera**;
es lo único que hay que mantener, y es lo que evita que un plan terminado siga diciendo "sin empezar" dos
meses después — que es exactamente lo que pasaba antes de escribir este índice.

> **Mantener este índice es el punto 6 de la checklist de cierre**, no una tarea aparte: al cerrar un
> stream se actualiza el plan y, **si ha quedado completo**, se marca cerrado y su fila se mueve de
> *Vivos* a *Cerrados*. Este índice cubre los planes del **core**; los de la suite y los productos de
> pago van al índice **privado**, y nada de aquel entra aquí.

> **Los cerrados viven en [`completed/`](completed/)** desde el 2026-09-29: la carpeta de `plans/` se
> había vuelto una lista de veintitantos directorios donde lo vivo y lo terminado pesaban igual, y lo
> que se abre a diario es lo primero. Mover un plan ahí es el último gesto de su cierre.
>
> ⚠️ Se mueve la carpeta **solo si TODO lo que hay dentro está cerrado**. `kwirth-status` es el
> contraejemplo y por eso sigue fuera: su `PLAN.md` está entregado, pero comparte carpeta con la **v2**,
> que está viva. Un plan vivo escondido bajo `completed/` es peor que no tener la carpeta.

## Vivos

| plan | de qué va | qué queda |
|---|---|---|
| [kwirth-status v2](kwirth-status/PLAN-v2.md) · [PRD](kwirth-status/PRD-v2.md) | Kwirth Status en diez pestañas: home, providers, grafo, rendimiento del proceso, plugins, extensiones, rutas HTTP, DCE y el log del core | S5 (el resto de extensiones: themes, homepages, logins, idps, aitoolsets, docs y packs) y backlog; publicado 0.7.0 (SQL en 0.6.0; el grafo, del DCE `xyflow` en 0.7.0) |
| [ai-tools](ai-tools/PLAN.md) | las tools de IA como extensión instalable (`aitoolset`) | S4–S7; las 43 viejas ya retiradas de `common-ai` (2026-09-26) |
| [icons](icons/PLAN.md) | aligerar el barrel de iconos | los dos que un sender pide por nombre, y el alias `/icons` en 26 `build.mjs` |
| [provider-debug](provider-debug/PLAN.md) | canal para ver en crudo lo que emite un provider | la fase de front |
| [sender-debug](sender-debug/PLAN.md) · [PRD](sender-debug/PRD.md) | canal para probar un sender a mano: elegir config, componer un mensaje y ver qué contestó | S1 en producción (`0.1.0`); queda el S2 de pulido. El duplicado de `listInstalled()` que cazó su e2e ya está arreglado en el core, en los **tres** managers que lo tenían |
| [pinocchio](pinocchio/PLAN.md) | backlog del plugin | se vacía por partes, sin fecha |
| [geppetto](geppetto/PRD.md) | analizador LLM de propósito general (PRD) | la decisión 6; sin código todavía |
| [pluvider](pluvider/PLAN.md) · [PRD](pluvider/PRD.md) | un plugin que además expone su información in-process | MVP en producción (agora y montag publican, provider-debug consume). **F6 cerrada**: la dirección simétrica — un **provider** puede ahora suscribirse a otro, con su fase de cableado `onProvidersReady()`. **F7 cerrada**: un provider declara a qué providers consume y el core los crea aunque ningún canal los pida. Queda la fase 2: `ask()`, `publications[]` y el descubrimiento en runtime |
| [gate](gate/PRD.md) | la pantalla de acceso como extensión programable | borrador |
| [serverless-runtimes](serverless-runtimes/PLAN.md) · [PRD](serverless-runtimes/PRD.md) | Kwirth en Google Cloud Run y Azure Container Instances, e **identidad de instalación** estable sin Kubernetes (ECS, Cloud Run, ACI o `uuid:` generado), sin configurar nada | **vivo** · ✅ **S1** (2026-10-06, `kwirth-common@0.5.64`): el core **arranca en Cloud Run y ACI** sin configurar nada (antes salía con `Unsupported execution environment`); validado en harness (618), e2e de arranque (`npm run e2e:boot`, 4/4) y **ECS real**. ✅ **S2** (2026-10-06, `kwirth-common@0.5.65`): **identidad de instalación sin Kubernetes**, sin configurar nada (`aws:ecs:…`, `gcp:run:…`, `azure:aci:…` o `uuid:` generado); en ECS real, estable al redesplegar. ✅ **S3** (2026-10-06): ejemplos `deploy/cloudrun/` y `deploy/aci/` + guía. **Todos los streams entregados, NO cerrado**: ⚠️ queda el QA real en Cloud Run y ACI (aplazado), y hasta entonces esos ejemplos no se han desplegado nunca |
| [ecs](ecs/PLAN.md) · [PRD](ecs/PRD.md) | desplegar Kwirth en AWS ECS (Fargate y EC2) con la misma imagen | **todos los streams entregados** (2026-09-24): el core arranca sin Kubernetes, se retiró Docker como fuente de recursos (12 artefactos republicados), y S2 quedó absorbido por S3 y S4. **No está cerrado**: falta el QA manual de S1 y las cuatro tareas de cierre — publicar el back, la corrida e2e completa, que `agora` vuelva a compilar (aparcado, ajeno) y actualizar los plugins instalados |
| [config-portability](config-portability/PLAN.md) · [PRD](config-portability/PRD.md) | llevarse la configuración de un Kwirth a otro | core, front y las open source con configuración, hechos; quedan Excubitor y Agora, que son la prueba de fuego |
| [provider-handle](provider-handle/PLAN.md) | lo que el core entrega a un consumidor deja de ser el `IProvider` real: un handle por (canal, instancia) | **en producción lo esencial**: el handle está en el core y el logger de providers cableado y publicado en los 13. Queda H2 a propósito —los diez consumidores que ya pasan por el core se migran cuando se toquen— y, abierto, que `started` significa "router montado" y no "arrancado" |
| [helm](helm/PLAN.md) | el chart de Helm puesto al día: una única fuente en `deploy/helm/kwirth`, todas las variables que lee el core hoy, imagen pinada, RBAC explícito, persistencia y Postgres, tests | **S1 construido** (chart `0.2.0`, 23 tests unitarios + e2e) y en **gate de QA**. Quedan S2 (guía y README con la URL real del repo, `kwirthmagnify.dev/helm-charts`) y S3 (publicar). Encontrados en 0.1.5: el Secret de usuarios con el nombre de la release (nadie podía entrar salvo con release `kwirth`) y `image: latest`, que en Docker Hub se quedó en abril |

## Cerrados

Terminados y en producción. Se consultan para saber **por qué** algo es como es.

| plan | entregado |
|---|---|
| [nettools](completed/nettools/PLAN.md) · [PRD](completed/nettools/PRD.md) | la DCE `nettools` y su plugin (`0.2.0` los dos, npm público y marketplace): DNS y alcanzabilidad TCP compartidos por las extensiones y contestados **desde donde corre Kwirth**, más el icono, un gráfico de latencias con recharts y el **historial compartido** que hay detrás. Es el ejemplo trabajado del tipo `dce` **en los dos lados**: el del navegador solo lo ejercitaba el contador del `sample`. El ICMP se entregó y se retiró el mismo día — Kwirth son contenedores, y depender del `ping` de la imagen no compensaba. ⚠️ Se cerró el 29, volvió a vivo el 30 por S4, y se cerró otra vez |
| [dce](completed/dce/PLAN.md) · [PRD](completed/dce/PRD.md) | el tipo `dce`, *dynamic core extension*: objetos que el core instancia **una vez** y otras extensiones consumen por id — lo común de una suite que no pertenece al core. Back, front, gestor, packs y scaffold; el consumidor no se instala sin su DCE y la DCE no se va mientras alguien la use |
| [previous-container-log](completed/previous-container-log/PLAN.md) | ver en el About el log del contenedor anterior cuando el core reinicia, con las líneas configurables desde los settings |
| [sso-idp](completed/sso-idp/SSO-IDP-PLAN.md) | el tipo `idp` y seis conectores SSO instalables |
| [login-extensions](completed/login-extensions/PLAN.md) | el tipo `login`: páginas de acceso con marca y canales limitados, con fondo de alta calidad donde el almacenamiento lo admite |
| [webhook-extension](completed/webhook-extension/PLAN.md) | el tipo `webhook`: la entrada de eventos, contraparte de los senders |
| [private-marketplace](completed/private-marketplace/PLAN.md) | marketplaces privados, con el manifest autenticado aparte de los paquetes |
| [plugin-scopes](completed/plugin-scopes/PLAN.md) | cada plugin publica sus scopes RBAC en runtime |
| [ops-trivy-scopes](completed/ops-trivy-scopes/PLAN.md) | la primera aplicación de lo anterior |
| [channel-start-rbac](completed/channel-start-rbac/PLAN.md) | el arranque de canal gateado por la API key que lo pide |
| [instance-view-none](completed/instance-view-none/PLAN.md) | la view `none`, para canales que no necesitan el clúster |
| [business-provider](completed/business-provider/PLAN.md) | `business` fuera del core, instalable, y `/provider/{alias}` |
| [http-pull-push](completed/http-pull-push/PLAN.md) | el provider que sondea HTTP y empuja a sus suscriptores |
| [extension-managers-ui](completed/extension-managers-ui/PLAN.md) | los once gestores de extensiones en un único diálogo |
| [extension-upgrade](completed/extension-upgrade/PLAN.md) | actualizar una extensión instalando encima, sin desinstalar y sin perder su configuración |
| [kwirth-status](kwirth-status/PLAN.md) · [PRD](kwirth-status/PRD.md) | una pantalla para echar un ojo a Kwirth por dentro: qué hay montado, cómo está, quién consume a quién y cuánto mueve. ⚠️ **NO está en `completed/`**: su carpeta aloja también la **v2**, que sigue viva |
| [user-admin-guide](completed/user-admin-guide/USER-ADMIN-GUIDE-PLAN.md) | la guía de usuario y administrador |
| [log-settings](completed/log-settings/PLAN.md) | el log del core configurable por componente y por id, y el endpoint `GET /managekwirth/log` que lo sirve. El visor se entregó en el `About` y **se mudó al plugin `status`**, a su pestaña *Log*; la configuración se quedó en *Kwirth settings → LOG* |

## Sin empezar

Documentados a propósito, para no volver a pensarlos desde cero el día que toquen.

| plan | por qué está parado |
|---|---|
| [provider-contract](provider-contract/PLAN.md) | decisión del usuario (2026-09-12): se deja escrito y no se toca |
| shell [1](shell/prd-1-shell-extension.md) · [2](shell/prd-2-channel-variants.md) · [3](shell/prd-3-dashboard-shell.md) | tres PRD encadenados: el tipo `shell`, las variantes de presentación de un canal y el dashboard |

## Lo que no es un plan

- [icons/ICONS-AUDIT.md](icons/ICONS-AUDIT.md) — inventario **generado**: `node tools/icons-audit.mjs`.
- [pluvider/DECISIONS.md](pluvider/DECISIONS.md) — las decisiones que sostienen ese plan.
- [completed/user-admin-guide/GUIDE-REVIEW-2026-07.md](completed/user-admin-guide/GUIDE-REVIEW-2026-07.md) — una revisión puntual
  de coherencia entre código y documentación.

> Los planes de las **extensiones** no están aquí: viven en el `docs/plan/` de cada una, junto a su código.
