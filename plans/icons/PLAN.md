# Iconos: limpieza del barrel

Backlog del tema "aligerar iconos". El inventario vivo está en [ICONS-AUDIT.md](ICONS-AUDIT.md),
que se regenera con `node tools/icons-audit.mjs`.

## Lo que conviene saber antes de tocar nada

**El barrel NO es tree-shakeable, y es a propósito.** `front/src/index.tsx` publica los 149 iconos
enteros en `window.__kwirth__.MUI.icons` —es el contrato con el que las extensiones pintan sus iconos
sin bundlearlos— y `PluginManagerDialog` resuelve el `"icon"` de un manifest **por nombre** contra ese
mapa. Consecuencia: cambiar QUÉ icono usa una pantalla no ahorra un solo KB. Lo único que adelgaza es
quitar exports del barrel, y eso es **cambio de contrato**.

**`@kwirthmagnify/kwirth-common-front` no se bundlea nunca.** El build de cada extensión lo mapea a
`window.__kwirth__.kwirthCommonFront`, así que la dependencia solo aporta tipos al compilar: subir su
rango no obliga a republicar el artefacto de la extensión.

**Un icono se puede consumir de cuatro formas**, y solo la primera se ve leyendo imports:

1. `import { X } from '@kwirthmagnify/kwirth-common-front/icons'`
2. `import { X } from './kwirthicons'` — dentro de common-front, ruta relativa
3. `import { X } from '@mui/icons-material'`
4. Por NOMBRE: `"icon": "X"` en un manifest, o `icon: 'X'` en código

Olvidar la 2 y la 4 produce falsos "sin usar". Pasó: `NotificationsOff` salió como huérfano y lo pinta
`common-front/src/MenuNotification.tsx`.

## Hecho

- **Two-tone del drawer fuera** (2026-09-11). Los cinco del submenú Workspaces eran los únicos del
  front. Se añadieron `Save`, `SaveAs`, `FileOpen` y `CreateNewFolder` al barrel y se retiraron los
  cinco two-tone. `FolderCopyTwoTone` **se queda**: 14 entradas de `plugins/manifest.json` lo piden por
  nombre y quitarlo dejaría sin icono a las versiones publicadas de fileman. common-front 0.5.54.
- **Deep imports de montag** (`6338b9c` en su repo): tres ficheros pasaron al barrel raíz.
- **Deep imports de common-ai**: cuatro iconos al barrel raíz, common-ai 0.5.48 publicado.
- **Cascada de common-front 0.5.54**: rango subido en los 22 dependientes. No se republicaron los
  artefactos, por lo dicho arriba: saldrían idénticos byte a byte.

- **Poda de los cinco sin uso** (2026-09-11): `Block`, `Checklist`, `DarkModeOutlined`,
  `LightModeOutlined` y `Panorama` fuera del barrel. common-front 0.5.55. Antes de borrarlos se
  comprobó, **solo sobre fuentes** (`.ts`/`.tsx`/`.json`), que no había ni una cita entrecomillada ni
  un uso como componente: los cinco nombres solo aparecían en su propia línea del barrel. Verificado
  con `tsc` y con el build del front, que ademas bajó 729 B. El barrel queda en 144.
  ⚠️ Lo que no se puede verificar desde aquí: una extensión de terceros, fuera del árbol, que pida uno
  por nombre. Se asumió ese riesgo a sabiendas.

## ⚠️ Quitar un icono del barrel rompe los plugins YA CONSTRUIDOS

Un plugin **no bundlea sus iconos**: su build mapea `@mui/icons-material` y el barrel de kwirth a
`window.__kwirth__.MUI.icons`, así que los pide **por nombre en runtime**. Si el icono ya no está, el
componente llega `undefined` y React revienta con *"Element type is invalid… got: undefined"* — no hay
error de compilación que lo avise, porque el `dist` es de antes.

Pasó al podar los nueve (2026-09-11): reventaron **fileman**, **alert** y **pinocchio**, cuyos `dist`
seguían pidiendo `AccountTreeOutlined`, `FolderCopyTwoTone`, `InfoOutlined`, `CheckCircleOutline`,
`DeleteOutlined` y `ScienceOutlined`. Arreglar las fuentes y pasar `tsc` **no basta**.

**Receta:** tras retirar un icono, reconstruir todo plugin que lo usara y republicar los que estén
publicados. Para comprobar que no queda ninguno, buscar los nombres retirados en los `*/dist/front.js`
— ojo, `Clear` da falso positivo porque aparece como texto de tooltip (`title: "Clear"`).

## Trampa al verificar esto

No barrer `.js`: `back/front/static/js`, `docker/bundle`, `electron/bundle`, `external/bundle` y
`tauri/src-tauri/{resources,target}` son **copias del front compilado** y llevan el barrel entero
minificado dentro, así que los 149 nombres dan positivo ahí. Dos barridos seguidos salieron
inservibles por esto. Buscar en `.ts`, `.tsx` y `.json`, y punto.

## Pendiente

### 1. `getNodeMeta()` no tiene consumidor
Doce senders lo implementan (`{ label, icon: 'AccessTime' }`) y **nadie lo llama**: es opcional en
`ISender`/`IWebhook` y el diseñador de composite resuelve sus tipos con iconos fijos. De ahí que
`AccessTime`, `CallSplit`, `Email` y `Speed` solo estén citados por nombre y no se pinten nunca. O se
cablea en el diseñador, o sobra en la interfaz.

### 3. Deep imports que quedan
`common-front/src/MsgBox.tsx` y `HelpButton.tsx` (`Error`, `Warning`, `Info`, `HelpOutline`).
common-front es la **excepción documentada** a la regla, así que esto es decisión, no deuda: se deja o
se alinea, pero no rompe nada.
