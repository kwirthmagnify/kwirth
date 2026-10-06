# Serverless runtimes — plan

> **Estado (2026-10-06)**: **vivo**. ✅ **S1** (Kwirth arranca en Cloud Run y ACI; `kwirth-common@0.5.64`) —
> validado en harness, e2e de arranque y **ECS real**; ⚠️ **Cloud Run y ACI reales pendientes** (se probarán
> más adelante). Quedan **S2** (identidad) y **S3** (guía de despliegue). PRD validado: [PRD.md](PRD.md).
> **Tipo**: core, público. Índice: [plans/README.md](../README.md).

Append-only. Lo que se decida y lo que se descarte se queda escrito aquí, aunque luego cambie.

## Por qué este orden

La identidad (S2) solo se puede probar donde Kwirth arranca, y hoy en Cloud Run y ACI **no arranca**
(`Unsupported execution environment. Exiting...`). Así que primero el arranque (S1), luego la identidad
(S2) y al final la guía (S3), que describe algo que ya existe.

Los tipos de `kwirth-common` no son un stream propio: un stream que solo publica tipos no entrega nada que
se pueda probar. Cada tipo entra con el stream que lo usa.

Cada stream cierra su propia CL9. **No hay fase de cierre acumulada.**

## Streams

| # | Stream | Estado | Notas |
|---|---|---|---|
| S1 | **Arranque en Cloud Run y ACI.** `EExecutionEnvironment.CLOUD_RUN` / `ACI` en `kwirth-common`; detección (`K_SERVICE`; sonda de 1 s al endpoint de identidad de Azure, la última y solo si nada casó); almacén en ficheros cifrados (`KWIRTH_STORE`) como ECS. Sondas inyectables | ✅ **HECHO** (2026-10-06, `kwirth-common@0.5.64`) — ⚠️ QA real de Cloud Run y ACI **pendiente** | `detectExecutionEnvironment` pasa a async con la sonda inyectable; la sonda da Azure con 200 (token) **o** con su error JSON (sin identidad gestionada), y no con el 404 de EC2 ni el 403 de GCP en la misma IP. `kwirthData` (`inCloudRun` / `inAci`) y `launchDocker` como ECS. Harness 607 → **618** (+11; 7 de ellos contra un servidor HTTP real que hace de cada nube). e2e nuevo **`npm run e2e:boot`**: arranca el proceso real con cada plataforma simulada y sin kubeconfig → Cloud Run, ACI, regresión ECS y regresión "sin señal" (4/4). **QA**: el entorno Kubernetes de dev sin cambios, y **ECS real con la imagen nueva** (`Execution environment: 'ecs'`, store en EFS). El `$PORT` de Cloud Run no era un riesgo: el core ya lee `PORT` |
| S2 | **Identidad de instalación.** `EInstallationIdSource` + `IInstallationIdentity` en `kwirth-common`; resolución al arrancar (ECS → metadatos de la tarea; Cloud Run → metadata server + `K_SERVICE`; ACI → `xms_az_rid`/`xms_mirid` del token; resto → `uuid:` persistido en el almacén); `clusterInfo.id` / `name` cuando no hay Kubernetes; log con la `source` y aviso si un `uuid:` vive en un almacén no persistente | ⬜ | **MVP**: dos instalaciones sin cluster tienen ids distintos y estables al reiniciar. Harness simulado + QA en ECS real (y en Cloud Run / ACI si hay acceso) |
| S3 | **Guía**: desplegar en Cloud Run y ACI (puerto del contenedor en Cloud Run, volumen para `KWIRTH_STORE`, identidad gestionada en ACI) y de dónde sale la identidad en cada sitio | ⬜ | Con capturas del log de arranque si aportan. S1 ya dejó en `installation.md` la sección corta (detección, `PORT`, almacén, `/healthz`); S3 añade los ejemplos de despliegue |

### Backlog (detectado en S1)

> Append-only.

- ⚠️ **ACI SIN identidad gestionada, sin confirmar.** La sonda cuenta con que Azure responda a `/metadata/identity/oauth2/token` con su error JSON cuando no hay identidad. Si en ACI ese endpoint **no responde en absoluto** sin identidad, Kwirth no detecta el entorno y **sigue negándose a arrancar**. Se confirma en el QA real de ACI; si pasa, la salida es la de abajo.
- **Entorno desconocido = no arrancar.** Hoy, sin ninguna señal, el core sale (`Unsupported execution environment`), y el e2e lo fija como regresión. Para "cualquier contenedor" sería más útil arrancar como contenedor genérico con almacén en fichero y avisar, en vez de salir. Es un cambio de comportamiento: decidirlo, no colarlo.

## Pendiente de confirmar

- **Acceso a GCP y Azure** para el QA real de S1/S2. Sin él, esos streams se cierran con el harness y su
  QA real queda **pendiente y dicho aquí**, no se da por hecho.
