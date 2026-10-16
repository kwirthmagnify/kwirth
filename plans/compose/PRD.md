# Compose — Kwirth con Docker Compose, lo más automatizado posible

> **Estado**: PRD escrito (2026-10-16). Sin código. Decisiones validadas por el usuario el 2026-10-16.
> **Tipo**: core, público. Índice: [plans/README.md](../README.md). Plan: [PLAN.md](PLAN.md).
> **Viene de**: [ecs](../ecs/PLAN.md) — el despliegue en ECS con CloudFormation funciona de punta a punta
> (crear, probar, borrar) y se quiere lo mismo para quien solo tiene Docker.

## 1. Resumen

Que cualquiera con Docker (Linux, Windows o macOS) levante un Kwirth **persistente, con su clave maestra
propia y opcionalmente con Postgres** con un solo comando, y que lo actualice, lo pare y lo borre con otro.
Es el equivalente de `cloudformation-full.yaml` + `create-stack`/`wait`/outputs, pero para una máquina.

**Criterio de éxito**: en una máquina limpia con Docker, `install` deja Kwirth contestando en
`http://localhost:3883` en menos de dos minutos, con la URL y el usuario inicial escritos en la consola;
`docker compose down` + `up` conserva usuarios y configuración; y "Restart Kwirth" desde la UI reinicia el
contenedor sin error.

## 2. El problema

- `deploy/compose/` está **vacía**. Lo único que hay es `docker run` documentado a mano en
  [docker/README.md](../../docker/README.md), y cada uno tiene que acordarse de los volúmenes, las variables
  y la clave maestra.
- El modo Docker guarda los **secretos en JSON plano** (`FILE_PLAIN`, formato histórico). ECS, Cloud Run y
  ACI ya cifran con `MASTERKEY`.
- Sin `MASTERKEY`, Kwirth usa la clave por defecto, que permite forjar credenciales offline
  ([auth-hardening](../auth-hardening/PLAN.md) A1). Un despliegue "rápido" a mano la deja casi siempre.
- Dos fallos del core con **Docker + kubeconfig** (los arreglos de ECS miran "¿hay API de Kubernetes?"
  cuando la pregunta es "¿Kwirth corre como pod?"):
  - **"Restart Kwirth"** intenta reiniciar un deployment con namespace y nombre vacíos, y falla.
  - **La pestaña Log de Status** queda vacía: el búfer en memoria (`corelog`) solo se expone sin
    kubeconfig, y el endpoint REST solo sirve dentro de un pod.

## 3. Personas

- **Quien prueba Kwirth** en su portátil: quiere verlo funcionar sin leer nada.
- **Quien lo deja corriendo** en una máquina o VM sin Kubernetes: quiere que persista, que se actualice y
  que sus secretos no estén en claro.
- **Quien observa un cluster desde fuera**: Kwirth en Docker con un kubeconfig montado.

## 4. Objetivos y no-objetivos

**Objetivos**
- Ficheros de compose equivalentes a los de ECS: base, SQL, kubeconfig y actualización automática.
- Script de instalación para Linux/macOS (`sh`) y Windows (PowerShell) que genera los secretos, levanta,
  espera a `/healthz` y dice dónde entrar; con `update`, `down` y `destroy`.
- Almacenamiento cifrado con `MASTERKEY` en los despliegues nuevos.
- Que restart y Log funcionen en Docker con y sin kubeconfig.

**No-objetivos**
- **Proxy / TLS / balanceador** (D3): los puertos se publican en `localhost` y listo.
- Cambiar el `docker run` histórico ni migrar su formato de ficheros planos.
- Observar el propio Docker Compose como fuente de recursos (ruta abandonada a propósito en `ecs`).
- Swarm, Podman o Kubernetes.

## 5. Conceptos

- **Base**: Kwirth solo, con un volumen con nombre para el store. Lo mínimo que persiste.
- **Override**: fichero de compose que se suma a la base con `-f` (SQL, kubeconfig, actualización).
- **`.env`**: donde el script deja `MASTERKEY` y la contraseña de Postgres, generadas una vez y nunca
  sobrescritas. Es el equivalente del secreto de Secrets Manager en ECS.

## 6. Requisitos funcionales

| id | requisito |
|---|---|
| RF1 | `docker-compose.yml`: imagen `kwirthmagnify/kwirth:${KWIRTH_TAG}`, puerto en `127.0.0.1` por defecto (configurable), volumen con nombre en `/data`, `restart: unless-stopped`, `healthcheck` contra `/healthz`, `MASTERKEY` desde `.env` |
| RF2 | Store cifrado: `FORCE=container` + `KWIRTH_STORE=/data` (D1) |
| RF3 | `docker-compose.sql.yml`: Postgres con su volumen y `healthcheck`, Kwirth espera a que esté sano, `KWIRTH_SQL_*` cableadas. Postgres **no** publica puerto |
| RF4 | `docker-compose.kubeconfig.yml`: monta el kubeconfig del usuario en solo lectura |
| RF5 | `docker-compose.watchtower.yml`: actualización automática **solo** del contenedor de Kwirth (D4) |
| RF6 | `install.sh` / `install.ps1` con `up`, `update`, `down`, `destroy`, `status`; `up` genera `.env` si no existe, espera a `/healthz` y escribe URL y usuario inicial |
| RF7 | "Restart Kwirth" fuera de un pod sale del proceso, con o sin kubeconfig (D2) |
| RF8 | Pestaña Log de Status con el búfer en memoria fuera de un pod, con o sin kubeconfig (D2) |
| RF9 | `deploy/compose/README.md` con los mismos apartados que el de ECS, y la guía al día |

## 7. Decisiones cerradas

- **D1** — Despliegues nuevos con compose usan **ficheros cifrados** (`FORCE=container` + `KWIRTH_STORE=/data`).
  El `docker run` histórico (`FILE_PLAIN`) sigue como está. *(validada 2026-10-16)*
- **D2** — Los dos fallos del core se arreglan en este plan, cambiando el criterio de "no hay API de
  Kubernetes" a **"no corre como pod"** (`!kwirthData.inCluster`). *(validada 2026-10-16)*
- **D3** — **Sin proxy ni TLS**: puertos publicados en `localhost`. *(validada 2026-10-16)*
- **D4** — Actualización: `update` en el script **y** Watchtower como override opcional. *(validada 2026-10-16)*

## 8. Lo que hay que decir en voz alta

- **`FORCE=container` hace que Kwirth se presente como `container`, no como `docker`**, en el log y en
  `KwirthData`. Es lo que da el cifrado sin tocar el formato histórico de Docker; si molesta, la alternativa
  es que el entorno Docker respete `KWIRTH_STORE` (cambio de core) — no se hace ahora.
- **"Restart Kwirth" no baja una imagen nueva** en Docker: `restart` reutiliza la imagen local. Para eso
  están `update` o Watchtower. Es el mismo matiz que tuvo ECS.
- **Perder `.env` es perder los secretos**: sin la `MASTERKEY` original los ficheros cifrados no se leen. El
  script no la sobrescribe nunca, y el README tiene que decirlo en rojo.
- **Watchtower necesita el socket de Docker**, que es acceso de root a la máquina. Por eso es opcional y
  limitado por etiqueta al contenedor de Kwirth.
- Publicar en `127.0.0.1` significa que **desde otra máquina no se entra** sin cambiar `KWIRTH_BIND`.

## 9. Criterios de aceptación

1. `install up` en Docker Desktop (Windows) y en Linux/WSL: Kwirth sano, URL y usuario en consola.
2. `down` + `up`: usuarios y settings siguen; el store en el volumen está cifrado (no hay contraseñas en claro).
3. Con `--sql`: la pestaña SQL de Status ve Postgres alcanzable.
4. Con `--kubeconfig`: Kwirth ve el cluster; "Restart Kwirth" reinicia el contenedor; la pestaña Log muestra líneas.
5. Sin kubeconfig: lo mismo de restart y Log.
6. `update` baja la imagen nueva y la arranca; con Watchtower lo hace solo.
7. `destroy` borra contenedores y volúmenes tras confirmar.

## 10. Abierto

- Nada bloqueante.
