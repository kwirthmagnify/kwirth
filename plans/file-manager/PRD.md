# file-manager — DCE del gestor de ficheros — PRD

> Estado: **VIVO** (2026-10-12). Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en streams va al [PLAN](./PLAN.md). Si algo de aquí contradice lo que ves en el
> producto, gana el producto.

## 1. El problema

El core carga con `@jfvilas/react-file-manager` **lo use alguien o no**. Lo importa
[front/src/index.tsx:15](../../front/src/index.tsx#L15) y lo publica en
`window.__kwirth__.jfvilasReactFileManager`, así que viaja en el bundle de todas las instalaciones de
Kwirth — también en las que no tienen ni `fileman` ni `magnify` instalados, que son las únicas dos
extensiones que lo tocan.

Es la misma situación que ya resolvieron [`xyflow`](../../dces/xyflow) y [`three`](../../dces/three):
una librería de front pesada, usada por unas pocas extensiones, metida en el core porque hasta que
existió el tipo `dce` no había otro sitio donde ponerla.

## 2. Objetivo

**Sacar el gestor de ficheros del core y meterlo en una DCE solo-front, para que lo instale quien lo
necesite.** El core queda más pequeño por defecto; quien quiera `fileman` o `magnify` instala además
la DCE, y Kwirth se lo exige.

### No objetivos

- **No se toca el código de `fileman`.** Sus `import` del paquete se quedan como están: lo que cambia
  es a dónde los resuelve su build. Ver §4.
- **No se envuelve ni se adapta la librería.** La DCE entrega el **namespace del módulo**, tal cual.
  Un wrapper sería una segunda API que mantener y un sitio más donde quedarse atrás.
- **No entra `magnify`** en esta entrega (decisión del usuario, 2026-10-12). 🔴 **Y no es lo que se
  creía al escribir esto**: `magnify` no es un plugin externo, es un canal **del core**
  (`front/src/channels/magnify/`), que importa la librería **y su hoja de estilos**. Lo destapó el QA
  de S2 (PLAN, F8). Migrarlo es un caso nuevo —un canal del core consumiendo una DCE— y hay que
  decidir cómo antes de tocarlo.
- **No se quita todavía del core.** Mientras `magnify` siga leyendo el global, quitarlo lo rompe. Es
  un stream aparte, cuando el usuario lo tenga migrado (decisión del usuario, 2026-10-12).

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien **opera** un Kwirth sin gestor de ficheros | Que el front no le baje una librería que no usa |
| CU2 | Quien instala `fileman` o `magnify` | Que Kwirth le diga qué le falta, y no una pantalla en blanco |
| CU3 | Quien **mantiene** `fileman`/`magnify` | Subir la versión de la librería sin tocar el core |

## 4. Concepto

```
   +------------------------------------------+
   |  DCE  file-manager   (solo front)        |
   |  el namespace de @jfvilas/react-file-... |
   |  + su CSS, puesto en la página al crear  |
   +--------------------+---------------------+
                        | create()  (una vez)
                        v
            window.__kwirth_dce__['file-manager']
                        ^
                        | el build del consumidor lo mapea
          +-------------+-------------+
          |                           |
     plugin fileman            plugin magnify
```

### El consumidor no cambia de código, cambia de build

Hoy `fileman` escribe `import { FileManager } from '@jfvilas/react-file-manager'` y su `build.mjs`
resuelve ese paquete contra `window.__kwirth__.jfvilasReactFileManager`. Después seguirá escribiendo
exactamente lo mismo, y su `build.mjs` lo resolverá contra **la instancia de la DCE**.

Es el mismo mecanismo de siempre —un mapeo de paquete a global— apuntando a otro sitio. Por eso la
DCE entrega el namespace del módulo y no un objeto propio: es lo que hace que el `import` del
consumidor siga significando lo mismo.

### El CSS lo pone la DCE

El gestor no se pinta sin su hoja de estilos, y el core deja de cargarla. La DCE la inyecta **al
crearse**, una sola vez, como ya hace `xyflow` con la de React Flow.

### Los tipos viajan en el paquete

El contrato es `typeof import('@jfvilas/react-file-manager')`: tipos y nada más, cero runtime. Se
publica como `index.d.ts` dentro del tarball, y el consumidor lo tipa dependiendo de la **versión
publicada**. Nunca un `file:` al repo.

## 5. Requisitos

### Funcionales

| # | Requisito |
|---|---|
| RF1 | DCE `file-manager`, **solo front**, que entrega el namespace de `@jfvilas/react-file-manager` |
| RF2 | Inyecta la hoja de estilos del paquete al crearse, una vez, y es idempotente |
| RF3 | Publica su contrato como `index.d.ts` en el tarball, con `types` en su `dist/package.json` |
| RF4 | `fileman` lo consume **sin tocar una línea de su `src`**: solo su `build.mjs` y su `package.json` |
| RF5 | `fileman` declara `requiresExtension`, y su entrada de manifest lleva el `requires` equivalente, así que Kwirth no deja instalarlo sin la DCE |
| RF6 | La DCE no bundlea React ni ReactDOM: resuelven contra los del core, o los hooks del componente no funcionarían |

### No funcionales

| # | Requisito |
|---|---|
| RNF1 | `requiresRestart: true`, como toda DCE |
| RNF2 | Todo el código, logs, UI y comentarios en inglés |
| RNF3 | Tiene su propio `docs/qa/` con histórico y los dos PNG, como el resto de extensiones |
| RNF4 | Se publica en npm **público**, con README dentro del tarball |

## 6. Riesgos

| # | Riesgo | Cómo se trata |
|---|---|---|
| R1 | Dos Reacts en la página y los hooks del componente dejan de funcionar | RF6: `react` y `react-dom` se mapean a los del core, como en `xyflow` |
| R2 | El consumidor **bundlea** la librería por error y hay dos copias | Su `build.mjs` mapea el paquete al registro; lo verifica el tamaño del bundle y el e2e |
| R3 | Se instala `fileman` sin la DCE y la pestaña sale rota | RF5: Kwirth bloquea la instalación y dice qué falta |
| R4 | Se quita del core antes de que `magnify` esté migrado | Fuera de alcance a propósito (§2). Stream aparte |

## 7. Decisiones cerradas

| # | Decisión | Quién, cuándo |
|---|---|---|
| D1 | El id es `file-manager`, por la librería y no por el consumidor, como `xyflow` y `three` | usuario, 2026-10-12 |
| D2 | El alcance es la DCE **y** `fileman`. Sacarlo del core espera a que `magnify` esté migrado | usuario, 2026-10-12 |
| D3 | La DCE entrega el **namespace del módulo**, no un objeto envuelto | 2026-10-12 |
| D4 | El CSS lo inyecta la DCE al crearse, como `xyflow` | 2026-10-12 |

## 8. Qué NO entra, y dónde queda anotado

Al backlog del PLAN:

- **Sacar la librería del core** (`front/package.json` y el global). Depende de `magnify`.
- **Migrar `magnify`**, que vive fuera del repo público.
- Que la DCE ofrezca la librería **bajo demanda** (lazy), como `xyflow` hace con elk.
