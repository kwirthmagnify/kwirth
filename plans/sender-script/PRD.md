# Sender Script — ejecutar un script, aquí o en otra máquina, como destino de un envío — PRD

> Estado: **VIVO** (2026-11-14, rev. 2). Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en streams va al PLAN, que se escribe cuando este PRD esté validado.
> Si algo de aquí contradice lo que ves en el producto, gana el producto.
>
> rev. 2: se añaden la ejecución **remota por SSH** (Linux y Windows, vía un DCE `ssh`) y el **asistente
> IA** que escribe el script a partir de una descripción en lenguaje natural.

## 0. Resumen

Un sender nuevo, `script` (`@kwirthmagnify/kwirth-sender-script`, público), cuyo destino no es un
servicio externo sino **un script que el administrador escribe en la propia configuración**. Cada envío
lanza ese script — **en el propio back** o **en otra máquina por SSH**, Linux o Windows — con el
intérprete elegido (`sh`, `bash`, `pwsh`, `powershell`, `cmd`), y le entrega el mensaje por **stdin**
y/o **variables de entorno**, a elección de la config.

Si Kwirth tiene un LLM configurado, el admin puede **describir lo que quiere en lenguaje natural** y que
la IA le escriba el script en el campo, para revisarlo y guardarlo.

**Criterio de éxito:** un admin conecta una alarma (Alert, Excubitor, un reenvío de log…) a una config
de `script`, describe "cuando llegue esto, haz un POST a mi webhook con el texto" y obtiene un script que
recibe el texto de la alarma y actúa — en el pod del back o en un servidor Windows de su red — **sin que
nadie escriba un sender nuevo**.

## 1. El problema

Cada destino que Kwirth sabe alcanzar es un sender escrito a propósito: Teams, Jira, SMTP, Datadog,
Graylog… Cuando el destino es **cualquier otra cosa** — una API interna, un CLI de un fabricante, un
`kubectl rollout restart`, un servicio en una máquina Windows, un fichero con un formato propio — hoy la
única salida es escribir, publicar e instalar un sender nuevo. Es desproporcionado para lo que muchas
veces son tres líneas de shell.

Y esas tres líneas a menudo **no pueden correr en el pod del back**: la acción vive en otra máquina
(reiniciar un servicio en un servidor, lanzar un script de un equipo de operaciones).

El sender `file` y el `console` cubren *dejar constancia*; ninguno cubre *actuar*.

## 2. Objetivo

**Poder escribir — o pedir a la IA que escriba — un script en la configuración de un sender, y que cada
mensaje que llegue a esa config lo ejecute, aquí o en otra máquina, con el mensaje como entrada.**

### No objetivos

- **No es un orquestador ni un runner de jobs.** Un envío = una ejecución (o una por lote, D5). No hay
  colas, reintentos programados ni historial de ejecuciones.
- **No es un sandbox.** En local el script corre con la identidad del back; en remoto, con la del usuario
  SSH (D9). Aislarlo es otro producto.
- **No ejecuta lo que genera la IA sin que lo vea una persona** (D11).
- **No trae botón TEST.** Los senders no exponen `configRouter`; para probar una config está
  [sender-debug](../sender-debug/PRD.md), que ya enseña el resultado o el error de un envío.
- **No hay WinRM ni exec en pods en V1** (§9).

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Admin con un destino que Kwirth no conoce | Mandar las alarmas a su API interna con un `curl` sin esperar a que exista un sender |
| CU2 | Admin que quiere **reaccionar** | Que una alarma concreta dispare una acción: reiniciar, escalar, abrir algo |
| CU3 | Admin cuya acción vive **en otra máquina** | Ejecutar el script en un servidor Linux o Windows de su red, por SSH |
| CU4 | Admin con el back en **Windows** | Lo mismo con `cmd` o PowerShell, en local |
| CU5 | Admin que **no escribe scripts** (o no en ese shell) | Describir lo que quiere y que la IA le dé el script |
| CU6 | Quien reenvía **logs** | Pasar un lote entero a un script sin lanzar un proceso por línea |

## 4. Concepto

```
  canal / plugin ──send()──▶ SenderManager ──▶ ScriptSender (config "x")
                                                  │
                         ┌────────────────────────┴─────────────────────────┐
                         │ target = local                                   │ target = ssh
                         ▼                                                  ▼
          script → temporal local (.sh/.ps1/.cmd)              DCE ssh: conecta (clave o contraseña,
          spawn del intérprete, ENTORNO LIMPIO (D3)            huella opcional D8), SFTP del script
          + KWIRTH_* como variables reales                     a un temporal remoto, KWIRTH_* como
                         │                                     PREÁMBULO del script (D7), exec
                         │                                                  │
                         └──────────── stdin ← none | body | JSON ──────────┘
                                                  │ espera fin o timeout, borra el temporal
                                                  ▼
                                      { exitCode, stdout, stderr }
                                      exit ≠ 0 / timeout ⇒ el envío FALLA
```

### Configuración (una por nombre, como cualquier sender)

| campo | tipo | defecto | qué es |
|---|---|---|---|
| `name` | text | — | nombre de la config |
| `target` | select | `local` | `local` · `ssh` |
| `interpreter` | select | `sh` | `sh` · `bash` · `pwsh` · `powershell` · `cmd` |
| `script` | **textarea** (D1) + asistente IA (D10) | — | el script, inline |
| `stdin` | select | `text` | `none` · `text` (solo el `body`) · `json` (el `ISenderMessage` completo) |
| `env` | boolean | `true` | añade las variables `KWIRTH_*` |
| `wait` | boolean | `true` | esperar a que el script termine; off = el envío vuelve al arrancar (RF6b) |
| `timeoutSeconds` | number | `30` | se mata el proceso (o se cierra el canal SSH) al vencer |
| `sshHost` | text | — | host o IP (solo `ssh`) |
| `sshPort` | number | `22` | |
| `sshUser` | text | — | |
| `sshPassword` | password | — | contraseña, o vacío si va con clave |
| `sshPrivateKey` | **textarea secreto** (D12) | — | clave privada PEM/OpenSSH |
| `sshPassphrase` | password | — | passphrase de la clave, si la tiene |
| `sshFingerprint` | text | — | huella SHA256 esperada; vacío = se acepta y se avisa (D8) |

Los campos `ssh*` están **siempre visibles** y **deshabilitados** con `target=local` (regla de diálogos:
nada aparece ni desaparece), con `enabledWhen` en `IConfigFieldDef` (`kwirth-common` 0.5.87, validado el
2026-11-14). Los secretos se devuelven reales y se muestran con el ojo (regla de secretos).

Variables con `env` activo: `KWIRTH_BODY`, `KWIRTH_SUBJECT`, `KWIRTH_LEVEL`, `KWIRTH_TO` (lista
separada por comas) y `KWIRTH_MESSAGE` (el JSON completo, para quien quiera `origin` o `metadata`).

### DCE `ssh`

Componente compartido de back (`@kwirthmagnify/kwirth-dce-ssh`, público) que envuelve `ssh2` para que
**el sender no lo empaquete** (plugins ligeros) y para que lo reutilice cualquier otra extensión
(nettools, futuras remediaciones). Contrato mínimo: conectar con una descripción de conexión, ejecutar un
comando con stdin y timeout devolviendo `{ exitCode, stdout, stderr }`, subir y borrar un fichero por
SFTP, y exponer la huella del host recibida. El contrato exacto va al PLAN.

### Asistente IA

```
 ┌ script ─────────────────────────────────────── [✨ AI] ┐   ← siempre visible; disabled sin LLM
 │ #!/bin/sh                                              │
 │ curl -s -X POST https://... -d "$KWIRTH_BODY"          │
 └────────────────────────────────────────────────────────┘
        │ click
        ▼
 ┌ Generate with AI ──────────────────────────────────────┐
 │ LLM key: [ openai-prod  ▾]                             │
 │ Describe what you want:                                │
 │ ┌────────────────────────────────────────────────────┐ │
 │ │ when an error-level alarm arrives, POST its text   │ │
 │ │ to my internal webhook                             │ │
 │ └────────────────────────────────────────────────────┘ │
 │                                  [Cancel] [Generate]   │
 └────────────────────────────────────────────────────────┘
        │  POST al core → generateText(aiInstructions + valores NO secretos del formulario + petición)
        ▼
   el resultado REEMPLAZA el contenido del textarea; el admin lo revisa y pulsa Save
```

Es una capacidad **del formulario genérico del core**, no del sender (D10): el sender no tiene front, y
así sirve a cualquier extensión con un `textarea` (plantillas de webhook, expresiones, JSON…).

## 5. Requisitos

### Funcionales — ejecución

- **RF1** — `send()` ejecuta el script de la config en el `target` elegido, con el intérprete elegido, y
  devuelve `{ exitCode, stdout, stderr }`, con stdout/stderr **recortados** (unos KB).
- **RF2** — La entrada la decide la config: `stdin` (`none`/`text`/`json`) y `env` (on/off), combinables.
  El contenido puede ser cualquier cosa, incluido texto libre (el resultado de una alarma).
- **RF3** — Código de salida distinto de 0, timeout o fallo de conexión SSH ⇒ el envío **falla** (se
  lanza el error, con el código y el final de stderr, o la causa de la conexión) y queda en el logger del
  sender (`setLogger`).
- **RF4** — `sendBatch()` = **una ejecución por lote**: en `json` el script recibe un **array**; en
  `text`, los `body` separados por salto de línea; con `env`, `KWIRTH_MESSAGE` lleva el array y
  `KWIRTH_BODY` los `body` unidos.
- **RF5** — Intérprete no disponible (en el host local o en el remoto) ⇒ error **que dice eso**, no un
  `ENOENT` crudo ni un "command not found" sin contexto.
- **RF6** — Los temporales del script (local o remoto) se borran al terminar, también si falla o vence el
  timeout. Si el borrado remoto falla, se avisa en el log, no se tapa.
- **RF6b** — `wait` (por defecto **on**) decide si el envío espera a que el script termine. Con `wait=off`
  el envío vuelve en cuanto el proceso **ha arrancado** con `{ started: true, pid }`; lo que se sabe al
  arrancar (intérprete ausente) sigue fallando el envío, y lo que pase después (exit ≠ 0, timeout) va
  **solo al log** del sender. El timeout se aplica igual, el temporal se borra al acabar, y parar el sender
  mata lo que siga vivo. Tope de **20** ejecuciones en segundo plano por config: pasado, el envío falla
  diciéndolo (una ráfaga de alarmas no puede llenar el pod de procesos). (Añadido 2026-11-14 a petición
  del usuario; tipos y tope validados.)
- **RF7** — `target=ssh`: autenticación por contraseña **o** por clave privada (con passphrase opcional).
- **RF8** — `target=ssh` con `sshFingerprint` informada: si la huella recibida no coincide, **no se
  ejecuta** y el envío falla diciendo ambas huellas. Vacía: se ejecuta y se escribe un aviso con la huella
  recibida, para copiarla a la config.
- **RF9** — `target=ssh`: sin dependencia del DCE instalado ⇒ el envío falla con un error que lo dice
  (y el sender declara el DCE en `requiresExtension`).

### Funcionales — asistente IA

- **RF10** — Un campo `textarea` con `aiInstructions` muestra un botón **AI**, siempre visible;
  **disabled** si Kwirth no tiene ningún LLM configurado (con tooltip que lo explica).
- **RF11** — El diálogo pide la clave de LLM a usar y la descripción en lenguaje natural; el core llama
  al LLM con `aiInstructions` del campo + los **valores no secretos** del formulario + la descripción.
- **RF12** — Nunca se envían al LLM campos `password` ni `textarea` secretos (D12).
- **RF13** — El resultado sustituye el contenido del campo **sin guardar**; Cancel del diálogo de config
  lo descarta. Un error del LLM se muestra en el diálogo, sin tocar el campo.
- **RF14** — El consumo cuenta en el control de uso de IA (`ai-usage-control`) a nombre de la extensión.
- **RF15** — Las `aiInstructions` del sender explican su contrato: intérpretes, qué trae stdin en cada
  modo, las `KWIRTH_*`, que exit ≠ 0 es fallo, que en remoto el script corre en la máquina destino, y que
  la respuesta es **solo el script**, sin markdown.

### No funcionales

- **RNF1** — Mismo comportamiento en Linux y Windows, local y remoto; los tests de cada plataforma se
  saltan con `test.skip()` fuera de ella.
- **RNF2** — El sender no empaqueta dependencias: local con builtins de Node; SSH a través del DCE.
- **RNF3** — El sender es solo back; el diálogo lo genera el core desde `getConfigSchema()`.
- **RNF4** — Los tests de SSH corren contra un servidor SSH de prueba (la clase `Server` de `ssh2`, dentro
  del propio proceso del test: sin contenedores), nunca contra máquinas reales.

## 6. Decisiones cerradas

- **D1 — El script va inline, en un campo nuevo `textarea`.** Se añade `'textarea'` a
  `TConfigFieldType` en `kwirth-common` y el formulario genérico del front
  ([ConfigFields.tsx](../../front/src/components/extensions/ConfigFields.tsx)) lo pinta multilínea y en
  monoespaciada. Descartado: un `text` con `\n`/`\t` escapados — la barra invertida es ambigua justo
  donde más se usa (`C:\temp\new.txt`, `printf "a\n"`) y un script en una línea no se mantiene.
  (Validado 2026-11-14.)
- **D2 — Un solo sender para Windows y Linux, con el intérprete en un select.** Lo que cambia es la línea
  de comando y la extensión del temporal; el resto es común. Las cinco opciones siempre visibles; elegir
  una que el destino no tiene da RF5. (Validado 2026-11-14.)
- **D3 — En local, el script NO hereda el entorno del back.** El entorno del back lleva credenciales (BD,
  tokens, master key). El hijo arranca con lo mínimo — `PATH`, `HOME`/`USERPROFILE`, `TEMP`/`TMP`, y en
  Windows `SYSTEMROOT`/`COMSPEC`/`PATHEXT` — más las `KWIRTH_*`.
- **D4 — La entrada la elige el usuario** (`stdin` y `env` independientes). (Validado 2026-11-14.)
- **D5 — Un lote es una ejecución.** Un reenvío de logs no puede lanzar cien procesos por segundo.
- **D6 — SSH es el único transporte remoto en V1, para Linux y para Windows.** Windows trae OpenSSH
  Server de serie (Windows 10 / Server 2019 en adelante); allí el select de intérprete elige `cmd`,
  `powershell` o `pwsh`. WinRM se descarta en V1: no hay librería sólida en JS puro y NTLM/Kerberos desde
  un pod Linux es caro. ⚠️ Validado "de momento" (2026-11-14): **se revisará más adelante** — ver §9.
- **D7 — En remoto, script por SFTP y `KWIRTH_*` como preámbulo.** sshd rechaza por defecto las
  variables de entorno del cliente (`AcceptEnv`), así que se inyectan al principio del script generadas
  según el intérprete (`export` en sh/bash, `$env:` en PowerShell, `set` en cmd), con el escapado de cada
  uno. Se sube por SFTP (también en Windows OpenSSH), se ejecuta y se borra.
- **D8 — La huella del host es opcional** (RF8): informada se exige; vacía se acepta y se avisa con la
  huella recibida. (El usuario no tenía preferencia, 2026-11-14.)
- **D9 — SSH vive en un DCE `ssh` público**, reutilizable, que envuelve `ssh2`. El sender lo declara como
  requisito. (Validado 2026-11-14.)
- **D11 — La IA solo REDACTA el script; nunca ejecuta nada.** La llamada es un `generateText` **sin
  herramientas**: el LLM no ejecuta, no prueba, no se conecta a ningún sitio ni ve el resultado de nada.
  Devuelve texto, ese texto cae en el campo, y lo revisa y guarda el admin; solo un envío posterior, con
  la config ya guardada, ejecuta el script. (Validado 2026-11-14.)
- **D13 — Público**, en `senders/script`, creado con `tools/create-kwirth-sender.mjs --id script --kind
  output --batch`; el DCE con `tools/create-kwirth-dce.mjs --id ssh`. README y guía dicen en la primera
  línea que ejecuta código.

## 7. Decisiones PENDIENTES de validar (cambian contratos del core)

- **D10 — Asistente IA como capacidad genérica del formulario.** `IConfigFieldDef` gana
  `aiInstructions?: string` (el contexto que la extensión da al LLM para ese campo); el formulario
  genérico pinta el botón **AI** en los `textarea` que lo traen; el core expone el endpoint que llama al
  LLM con `common-ai`. Alternativa descartada: solo para este sender — imposible sin front propio, y
  reinventaría lo mismo en cada extensión.
- **D12 — `secret?: boolean` en `IConfigFieldDef`, aplicable al `textarea`.** Necesario para la clave
  privada SSH: un PEM es multilínea (un `password` de una línea pierde los saltos al editarlo) y es un
  secreto (con ojo, como los `password`, y **excluido del prompt** del LLM, RF12). Se guarda y devuelve
  real, como manda la regla de secretos.

## 8. Lo que hay que decir en voz alta

- 🔴 **Es ejecución de código arbitrario**: en local, dentro del back, con su ServiceAccount, su sistema
  de ficheros y su red; en remoto, con la identidad del usuario SSH en esa máquina. La protección es la
  de cualquier configuración de extensión: solo quien administra senders puede escribir uno.
- 🔴 **El código lo puede escribir una IA.** Puede equivocarse, inventar opciones o hacer algo
  destructivo. Por eso nunca se guarda ni ejecuta solo (D11); la guía lo dice, y recomienda probarlo con
  sender-debug antes de conectarlo a nada real.
- **Sin huella, SSH acepta cualquier host** (D8): quien se ponga en medio recibe el script y el mensaje.
  Se avisa en el log en cada conexión; la guía recomienda informarla.
- **El entorno limpio (D3) puede sorprender**: un script que espera una variable del contenedor no la
  verá. Es a propósito; se documenta.
- **Imagen del back:** `sh` está garantizado; `bash` y `pwsh` dependen de la imagen base. Hay que
  comprobar qué trae la imagen oficial y decirlo en la guía.
- **`cmd` y el texto libre:** el escapado de `set` en cmd es frágil con según qué caracteres; con `cmd`,
  la vía robusta para el texto de la alarma es `stdin=text`. Se documenta.
- **Un script lento retiene el envío** hasta su timeout; quien llama al sender espera ese tiempo.
- **Toca el core**: `textarea`, `aiInstructions`, `secret` y el endpoint de IA ⇒ publicar
  `kwirth-common` y reconstruir el front (agrupado en un solo rebuild).
- **SSH es nuevo para el usuario** (D6): el diseño se revisará con él antes de cerrar.

## 9. Fuera de V1 (anotado)

- **WinRM / PowerShell Remoting** como segundo transporte remoto.
- **Exec en un pod del cluster.** El back ya tiene `execApi`
  ([ClusterInfo.ts:116](../../back/src/model/ClusterInfo.ts#L116)), pero un sender solo recibe
  `ISenderAccess`: haría falta ampliar el contrato del core para darle acceso al cluster.
- **Variables propias de la config** (p. ej. un token para el `curl`), como secretos declarados por el
  admin.
- **Argumentos al script** además de stdin/env.

## 10. Criterios de aceptación

1. Local, Linux: `sh` + `stdin=text` con `cat > /tmp/out.txt` deja el `body` exacto enviado desde
   sender-debug.
2. `stdin=json` entrega un JSON que se parsea al `ISenderMessage` enviado; `env=on` expone las cinco
   `KWIRTH_*` con los valores esperados, en local y en remoto.
3. En local, el script no ve ninguna variable del back fuera de la lista de D3.
4. `exit 3` ⇒ error con el código 3 y el stderr; un `sleep` mayor que el timeout ⇒ error de timeout y el
   proceso (o el canal SSH) cerrado.
5. Un lote de N mensajes produce **una** ejecución con un array de N (json) o N líneas (text).
6. SSH contra un servidor de prueba: con contraseña y con clave (con y sin passphrase); huella correcta ⇒
   ejecuta; huella incorrecta ⇒ no ejecuta y dice las dos; sin huella ⇒ ejecuta y avisa con la recibida.
7. Windows (local y SSH): lo mismo con `cmd` y `powershell`; intérprete inexistente ⇒ error legible.
8. Ningún temporal queda en disco (local ni remoto) tras ningún caso.
9. Diálogo: `script` y `sshPrivateKey` multilínea en monoespaciada; la clave con ojo; guardar y reabrir
   conserva saltos, tabuladores y barras invertidas tal cual.
10. Asistente IA: con LLM configurado, una descripción produce un script en el intérprete elegido que cae
    en el campo sin guardarse; el prompt enviado no contiene ningún secreto; sin LLM, el botón está
    disabled con su explicación; el consumo aparece en el control de uso.
11. Tests unitarios y e2e en verde (e2e del asistente con un LLM de pega, nunca con tokens reales).
