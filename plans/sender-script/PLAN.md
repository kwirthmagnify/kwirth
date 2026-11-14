# Sender Script — PLAN

> Estado: **A y B CERRADOS** (2026-11-14, core `0.6.111` + `sender/script@0.1.0` publicado, ejecución en
> local); **C pendiente** (DCE `ssh` + target `ssh`). El plan sigue vivo.
> Producto, decisiones y criterios de aceptación: [PRD](./PRD.md) (rev. 2). Aquí solo el *cómo* y el orden.
> D10 (`aiInstructions`) y D12 (`secret`) validados el 2026-11-14.

## 1. Estado verificado del código (2026-11-14)

| qué | dónde | estado |
|---|---|---|
| Tipo de campo de config | `common/src` → `TConfigFieldType` / `IConfigFieldDef` (`kwirth-common` **0.5.85**) | `text·number·boolean·password·select·json·multiselect`; sin multilínea, sin `secret`, sin `aiInstructions` |
| `ISenderFieldDef` | `kwirth-common-back` **0.6.14** (`ISender.d.ts`) | alias de `IConfigFieldDef`: lo nuevo de common le llega solo |
| Formulario genérico | [ConfigFields.tsx](../../front/src/components/extensions/ConfigFields.tsx) — lo usan `ConfigFormDialog`, `IdpConfigDialog`, `ScopeConfigDialog` | todo lo que no es boolean/select/multiselect cae en un `TextField` de **una línea** (L101), `json` incluido |
| LLM en el core | `generateText` envuelto de `kwirth-common-ai/back` (L639) cuenta y corta por clave; `buildModel(llm, providers)` (L30) | el back ya usa `common-ai` **0.5.80**; `/core/aiconfig` tiene `providers`, `loadmodels`, `llms`, `usage` — **ningún endpoint de generación** |
| Consumo de un DCE desde un back | `getDce<IContrato>('id')` de `kwirth-common-back`, contrato declarado local (patrón `providers/cloud-config/src/back/resolveAws.ts`) | disponible |
| Senders y `configRouter` | ningún sender lo tiene | confirmado: no hay botón TEST; se prueba con sender-debug |
| Scaffolders | `create-kwirth-sender.mjs` (`--kind output --batch`), `create-kwirth-dce.mjs` (`--sides back`) | disponibles |

## 2. Streams

Tres streams, cada uno con su QA, su documentación y su checklist de cierre (no hay stream de "docs al
final"). Se para al acabar **cada** uno.

### A — core: campos nuevos y redacción con IA

Antes S1+S2+S3: los tres se cerraban con el mismo QA, porque solo S3 trae UI.

- **common** — `TConfigFieldType` += `'textarea'`; `IConfigFieldDef` += `secret?: boolean` y
  `aiInstructions?: string`, con su comentario de contrato. Publicar `kwirth-common` 0.5.86 y subir la
  dependencia en `back`, `front` y `common-back` (este republicado solo si su lockfile lo exige).
- **back** — `POST /core/aiconfig/assist` en [AiConfigApi.ts](../../back/src/api/AiConfigApi.ts):
  `llmId`, `aiInstructions`, valores del formulario con su tipo y la petición → `{ text }`. `buildModel` +
  `generateText` **envuelto** (cuenta en el control de uso), **sin `tools`** (D11). **Doble filtro de
  secretos**: el front no los manda y el back descarta igualmente `password` y `secret: true` (RF12).
  Quita vallas de markdown. ⚠️ A decidir con el código delante: si exige el permiso de editar configs de
  extensión (admin) y no solo clave válida; se dice al hacerlo.
- **front** — `textarea` multilínea en monoespaciada, **altura fija** con scroll dentro; `secret` con ojo
  `Visibility`/`VisibilityOff` (técnica de enmascarado a probar en Chrome/Edge/Firefox); botón **AI**
  siempre visible, `disabled` + tooltip sin LLM; `AiAssistDialog` (clave LLM de ancho fijo, petición,
  Help, Cancel/Generate, error dentro); el resultado sustituye el campo **sin guardar**. **Un solo
  rebuild** del front; verifico el bundle antes de pedir QA.
- **docs** — guía de autores de extensiones: `textarea`, `secret`, `aiInstructions`.
- **Validación:** tests de common; unit del endpoint con modelo de pega (prompt sin secretos, sin tools,
  vallas quitadas, error tipado); e2e Playwright con un LLM **de pega** (servidor compatible OpenAI local,
  cero tokens). Hasta que exista el sender, el e2e usa un campo `textarea` de una extensión de prueba.
  **QA** del usuario.

**Avance (2026-11-14) — código hecho, sin cerrar:**

- `kwirth-common` **0.5.86 publicado**: `'textarea'`, `secret`, `aiInstructions` y los tipos del endpoint
  `IConfigAiAssistField` / `IConfigAiAssistRequest` / `IConfigAiAssistResponse` (validados por el usuario).
  Instalado en `back` y `front`.
- Back: `POST /core/aiconfig/assist` (puerta = `validKey`, la misma que editar la config de un sender —
  decidido con el código delante); lógica pura en `back/src/tools/AiAssist.ts`; límite de uso → 429.
  Tests: `tests/tools/aiAssist.test.ts` y `tests/api/AiConfigApiAssist.test.ts` contra un LLM
  compatible OpenAI **de pega** en localhost (ve la petición: sin secretos, sin `tools`). Suite: 1008 ✔.
- 🔴 **Hallazgo 1 — dos renderizadores.** Senders y webhooks NO usan `ConfigFields`, sino
  `ConfigListDialog`. El `textarea` va en un componente compartido, `ConfigTextArea` (+ `AiAssistDialog`),
  usado por los dos. Secreto oculto = un punto por carácter conservando saltos, **solo lectura** (no hay
  `type=password` multilínea y editar a ciegas no tiene sentido); el ojo lo revela y lo hace editable.
- 🔴 **Hallazgo 2 — la exportación filtraba por `type === 'password'`.** La exportación sin credenciales
  de senders, webhooks e IdPs y el enmascarado de `IdpApi` solo miraban `password`: una clave SSH en un
  `textarea secret` habría salido en claro en el fichero. Ahora todos usan un único predicado,
  `back/src/tools/ConfigFieldSecrets.ts` (`isSecretFieldDef`), con test en `coreManagedConfig.test.ts`.
- Docs: `docs/0.6.31/guide/extensions/ai-assist.md` (nueva, en el sidebar; es la ayuda del diálogo) y
  *Field types* en `docs/0.6.31/senders/developing.md`.
- ⚠️ **El e2e y el QA de A se cierran con B**: ninguna extensión declara aún un `textarea`, así que la UI
  de A no se puede ver hasta que exista el sender. Un solo rebuild del front para A+B.

### B — sender `script` en local

Antes S5.

- `node tools/create-kwirth-sender.mjs --id script --publisher @kwirthmagnify --kind output --batch`.
- Schema completo del PRD §4 (los `ssh*` ya presentes, ignorados en local), `aiInstructions` en
  `script`, `secret` en `sshPrivateKey`.
- Temporal con la extensión del intérprete, `spawn` con **entorno limpio** (D3) + `KWIRTH_*`, stdin
  `none/text/json`, timeout con kill, recorte de salida, error legible por intérprete ausente (RF5),
  borrado del temporal siempre, `sendBatch` = una ejecución.
- README (primera línea: ejecuta código) y guía: ejemplos (curl, `kubectl`, `Invoke-RestMethod`),
  intérpretes de la imagen oficial del back, entorno limpio, cmd + stdin, el asistente IA (solo redacta).
- **Validación:** unit con valores reales por cada combinación (intérprete × stdin × env × lote), los de
  `cmd`/`powershell` con `test.skip()` fuera de Windows; e2e del diálogo del sender con el botón AI.
  **QA** con sender-debug. Publicar y `senders/manifest.json`.

**Avance (2026-11-14) — código, tests y e2e hechos; pendiente el QA (que cierra A+B) y publicar:**

- `senders/script` (scaffolder `--kind output --batch`; el `map.ts` de destinos de log, eliminado). Tipos
  validados: `EScriptInterpreter`, `EScriptStdin`, `IScriptSenderConfig`, `IScriptRunResult` (+ `ICommandLine`,
  interno de `build.ts`, avisado después). Bundle: 14 KB, sin dependencias.
- Tests: 28 ✔ en el host; **también dentro de `node:24-alpine3.24`** (la base de la imagen oficial): 27 ✔,
  `bash` saltado porque no existe ahí — y el error que da es el legible de RF5.
- 🔴 **Hallazgo 3 — la imagen oficial es Alpine**: solo `sh` y `wget` de BusyBox; ni `curl`, ni `bash`,
  ni `jq`, ni `pwsh` (comprobado en la imagen). Va al README, a la guía y a las `aiInstructions` (que piden
  `wget` y sh POSIX). Los ejemplos de `wget` se probaron en la imagen.
- 🔴 **Hallazgo 4 — el formulario de configuraciones ignoraba los `default` del schema** al crear una
  (`ConfigListDialog.nueva()` arrancaba con `{}`): el select se veía «—» y el switch apagado, distinto de
  lo que el sender declara y ejecuta. Corregido en el core; lo cubre el e2e.
- e2e `front/e2e/tests/sender-script.spec.ts`: 6 ✔, con `/core/aiconfig/llms` y `/assist` **interceptados**
  (ni se leen ni se tocan los LLM del dev, cero tokens); crea una config con nombre único y la borra.
  Regresión: `senders-manager`, `sender-help`, `providers-manager`, `provider-config-test`,
  `kwirth-portability` en verde. Dos rojos **ajenos**: `config-bundle` (censor no instalado en este dev) e
  `idp-manager:108` (busca el `Switch` de *Allow signup* como `checkbox`; desde MUI 9 su rol es `switch`).
- Guía `docs/0.6.31/guide/extensions/senders/script.md` (+ índice y sidebar), tgz de docs regenerado.
- Sin probar en real: `cmd`/`powershell` (los 3 tests de Windows se saltan aquí).
- Durante el QA (2026-11-14), a petición del usuario: diálogo de IA rehecho con el patrón de referencia;
  título encima del campo solo en el `textarea` con IA (el robot al lado); guardar CIERRA la edición en
  `ConfigListDialog` (Add y Update; afecta a webhooks: su URL se ve al abrir la config, `capture-webhooks`
  adaptado sin ejecutar); y **`wait`** (RF6b): sin esperar, el envío vuelve al arrancar con
  `{ started, pid }`, lo posterior va al log, tope de 20 en segundo plano por config, `stopSender` las mata.
  Tipo nuevo `IScriptStartResult` (validado) e interno `ILocalRun`. Tests: 35 ✔ host, 34 ✔ Alpine; e2e 7 ✔.
- Tgz de la guía regenerado con lo de `wait` y el back reiniciado (la guía servida la tiene).

**Cierre A+B (2026-11-14) — CL9 + bbpm pedidos por el usuario:** harness del back 1008 ✔ · 4 ⏭ (+14,
todos de A), c8 81.09 / 79.57 / 75.20 %; sender 38 (35 ✔ · 3 ⏭ Windows), c8 96.98 / 84.72 / 82.05 %; e2e
64 specs · 255 casos. Históricos y PNG de `docs/qa/` y `senders/script/docs/qa/` al día. **QA manual de
Q3–Q10 sin hacer**: el usuario pidió el bbpm, que lo autoriza; Q1, Q2 y un envío real con Sender Debug sí
se validaron. `sender/script@0.1.0` publicado en npm y en `senders/manifest.json`.
- Al pasar con cobertura destapó que **Node reinyecta `NODE_V8_COVERAGE` en todo `spawn`** aunque se le dé
  un `env` propio: el test del entorno limpio la admite solo cuando c8 mide. No existe en el back.
- `capture-webhooks` no se ha ejecutado: en este dev no hay ningún webhook instalado (necesita el de
  Jira). La captura no cambia: la misma config abierta con su Webhook URL, a la que ahora se llega
  pinchándola en la lista.
- Pendiente de A: la nota de `ConfigTextArea` en el comentario de `ExtensionConfig.ts` sale con el
  siguiente `kwirth-common`; los dos rojos ajenos (`config-bundle`, `idp-manager:108`) siguen anotados.

### C — DCE `ssh` + target `ssh`

Antes S4+S6: el DCE no tiene QA propio, solo se ve funcionar a través del sender.

- `node tools/create-kwirth-dce.mjs --id ssh --publisher @kwirthmagnify --sides back`, envolviendo
  `ssh2`. Contrato: conectar (host, puerto, usuario, contraseña | clave + passphrase, huella esperada
  opcional), `exec(cmd, stdin, timeout)` → `{ exitCode, stdout, stderr }`, `put`/`remove` por SFTP,
  huella recibida. **El tipo del contrato te lo enseño antes de escribirlo** (tipo nuevo).
- Sender: `getDce` con contrato local, DCE en `requiresExtension`, DCE ausente → error legible (RF9);
  preámbulo `KWIRTH_*` por intérprete con su escapado (D7), SFTP a temporal remoto, exec, borrado (aviso si
  falla), huella (RF8).
- README del DCE; la guía del sender gana SSH: autenticación, huella, Windows con OpenSSH.
- **Validación:** tests de DCE y sender contra un **servidor SSH en proceso** (la clase `Server` de
  `ssh2`), sin Docker ni máquinas reales: contraseña, clave con y sin passphrase, huella buena/mala/vacía,
  timeout, exit ≠ 0, temporales borrados. ⚠️ Windows remoto: QA manual contra una máquina con OpenSSH; si
  no hay, queda dicho como pendiente y el stream no se da por cerrado. **QA** con sender-debug. Publicar
  DCE (primero) y sender.

**Avance (2026-11-14) — código, tests, e2e y docs hechos; pendiente el QA del usuario (Linux y Windows):**

- Contrato del DCE validado (sesión `connect` → `home`/`put`/`remove`/`exec`/`close`; resultados `ok`/fallo
  tipado `ESshError`; exit ≠ 0 es resultado, el timeout es fallo). `dces/ssh` con el scaffolder; ssh2
  empaquetado sin sus dos nativos opcionales (~735 KB sin minificar). 18 tests contra un servidor `ssh2` en
  proceso; c8 97.56 / 89.69 / 100 %.
- 🔴 **Hallazgo 5 — la regla de diálogos pedía deshabilitar, y el core no sabía.** El usuario eligió
  `enabledWhen` en `IConfigFieldDef` (`IConfigFieldEnabledWhen { field, values }`, `isConfigFieldEnabled`
  con el `default` del otro campo como respaldo): `kwirth-common@0.5.87` publicado; `ConfigFields`,
  `ConfigListDialog` y `ConfigTextArea` deshabilitan y no exigen un requerido deshabilitado.
- Sender: `target` (`EScriptTarget`) + `ssh*` con `enabledWhen`; `remote.ts` con la copia local del
  contrato; `KWIRTH_*` como preámbulo en el fichero subido (D7), BOM para PowerShell, rutas Windows, línea
  de lanzamiento para `cmd`; `wait=off` arranca al conectar+subir y devuelve `{ started, host }`;
  `IScriptStartResult.pid` pasa a opcional; RF8: aviso de huella no comprobada una vez por config. Tipos
  validados. `requiresExtension` = `dce:ssh:0.1.0`. 61 tests (58 ✔, 3 Windows); c8 97.90 / 87.44 / 87.50 %.
- e2e `sender-script` 8 ✔ (los `ssh*` deshabilitados con local); regresión de formularios en verde salvo el
  ajeno `idp-manager:108`.
- Verificado con los **bundles reales** contra un servidor en proceso y contra **OpenSSH 10.3 real**
  (contenedor `kwirth-qa-ssh`, puerto 2222, usuario `kwirth`).
- 🔴 **Hallazgo 6 — cerrar el canal NO mata el proceso remoto.** Contra OpenSSH real, un `sleep 30` siguió
  vivo tras el timeout. El servidor de pruebas lo mataba (test falso): corregido para ser fiel, y contrato,
  READMEs y guías dicen ahora que el script debe limitarse solo (`timeout` en Linux). Posible mejora V2:
  un vigilante remoto que mate el árbol (p. ej. `timeout -s KILL` cuando exista), sin abrir aquí.
- Pendiente para cerrar C: QA del usuario, Windows con OpenSSH incluido (si no hay máquina, C no se cierra).

## 3. Orden y dependencias

```
A (core) ─────────────▶ B (sender local) ──▶ C (DCE ssh + target ssh)
```

B usa los tipos de A (`textarea`, `secret`, `aiInstructions`) y su QA necesita el front de A. C necesita
B. Si conviene adelantar, la parte de código y tests del DCE de C puede ir en paralelo con B.

## 4. Riesgos de ingeniería

- **Ocultar un textarea secreto**: no existe `type=password` multilínea; la técnica de enmascarado hay
  que probarla en los tres navegadores (A).
- **Escapado de `cmd`** en el preámbulo: se cubre con tests de caracteres raros; si no es fiable, la guía
  dice "con cmd, stdin" y el preámbulo se limita a lo seguro (C).
- **Windows remoto sin entorno de pruebas automático** (C).
- **`ssh2` trae una dependencia nativa opcional** (`cpu-features`): comprobar que el DCE funciona sin
  ella en la imagen del back (C).
