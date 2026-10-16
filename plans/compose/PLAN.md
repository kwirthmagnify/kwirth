# Compose — plan

> **Estado**: streams propuestos (2026-10-16), **pendientes de validar**. Sin código.
> **Tipo**: core, público. Índice: [plans/README.md](../README.md). PRD: [PRD.md](PRD.md).

Append-only. Lo que se decida y lo que se descarte se queda escrito aquí, aunque luego cambie.

## Estado verificado del código (2026-10-16)

- `deploy/compose/` existe y está vacía.
- [ExecutionEnvironment.ts](../../back/src/tools/ExecutionEnvironment.ts): Docker se detecta por
  `/.dockerenv` y guarda en `FILE_PLAIN`; `FORCE=container` da `FILE` cifrado en `KWIRTH_STORE`.
- [ManageKwirthApi.ts](../../back/src/api/ManageKwirthApi.ts) `/restart`: sale del proceso solo si
  `!this.coreApi`. Con kubeconfig llama a `restartController` con `kwirthData.namespace` y
  `kwirthData.deployment` vacíos.
- [index.ts](../../back/src/index.ts): el provider interno `corelog` se crea solo si
  `!capabilities.kubernetes`; `/managekwirth/log` responde "not running as a pod" si `!kwirthData.inCluster`.
- `KWIRTH_SQL_*` en [index.ts](../../back/src/index.ts): sin `KWIRTH_SQL_HOST` no hay SQL.
- Imagen: expone 3883, sin `HEALTHCHECK`; `/healthz` responde 200 en todos los entornos.

## Por qué este orden

Primero el core (S1), porque los ficheros de compose y el script se validan con restart y Log, y hoy
fallan con kubeconfig. Luego los ficheros (S2), que se pueden probar a mano con `docker compose`. Luego el
script (S3), que solo envuelve lo que S2 ya demostró. La documentación va en cada stream (punto 4 de la
CL9), y S4 deja el README completo y la guía.

Cada stream cierra con su propia CL9 completa. **No hay fase de cierre acumulada.**

---

## S1 — Core: restart y Log fuera de un pod

**MVP**: en Docker con kubeconfig, "Restart Kwirth" reinicia el contenedor y la pestaña Log muestra líneas.

| paso | qué |
|---|---|
| S1.1 | `/restart`: si `!kwirthData.inCluster` → responder y `process.exit(0)`, haya o no `coreApi`. Dentro de un pod, como hoy. |
| S1.2 | `corelog`: instanciarlo si `!kwirthData.inCluster` (no por `!capabilities.kubernetes`). |
| S1.3 | Sacar las dos decisiones a funciones puras y testarlas: pod / Docker con kubeconfig / Docker sin kubeconfig / ECS. |

**Validación**: harness (`npm test` en back) + QA manual en Docker con y sin kubeconfig.

## S2 — Ficheros de compose

**MVP**: `docker compose up -d` con la base deja Kwirth sano en `localhost:3883`, persistente y cifrado.

| paso | qué |
|---|---|
| S2.1 | `docker-compose.yml` (RF1, RF2) + `.env.example` |
| S2.2 | `docker-compose.sql.yml` (RF3) |
| S2.3 | `docker-compose.kubeconfig.yml` (RF4), con la nota de `host.docker.internal` para clusters locales |
| S2.4 | `docker-compose.watchtower.yml` (RF5), filtrado por etiqueta |
| S2.5 | `.gitignore` para `.env` |

**Validación**: `docker compose config` de todas las combinaciones + QA real en Docker Desktop: sano,
persistencia tras `down`/`up`, store cifrado, SQL alcanzable.

## S3 — Script de instalación

**MVP**: `install up` en una máquina limpia deja Kwirth funcionando y dice dónde entrar.

| paso | qué |
|---|---|
| S3.1 | `install.sh` (Linux/macOS/WSL) y `install.ps1` (Windows) con `up`, `update`, `down`, `destroy`, `status` y las opciones `--sql`, `--kubeconfig`, `--watchtower`, `--tag` |
| S3.2 | `.env` generado una vez: `MASTERKEY` y contraseña de Postgres aleatorias; nunca se sobrescribe |
| S3.3 | Espera a `/healthz` con tiempo máximo, y al acabar URL + usuario inicial; si no arranca, últimas líneas del log |
| S3.4 | `destroy` pide confirmación antes de borrar volúmenes |

**Validación**: QA real con los dos scripts (PowerShell en Windows, `sh` en WSL o Git Bash).

## S4 — Documentación

| paso | qué |
|---|---|
| S4.1 | `deploy/compose/README.md` con los apartados del de ECS: qué hay, arranque rápido, qué se crea, actualizar, borrar, datos y secretos, kubeconfig, SQL |
| S4.2 | [docker/README.md](../../docker/README.md) enlaza a compose como la forma recomendada |
| S4.3 | Guía de administración (`docs/0.6.31/`): despliegue con compose, y regenerar el tgz de la guía |

**Validación**: revisión del usuario.
