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

## Pendiente

### 1. Cinco iconos sin ningún uso
`Block`, `Checklist`, `DarkModeOutlined`, `LightModeOutlined`, `Panorama`. Son los únicos candidatos a
poda. ⚠️ Es cambio de contrato: cualquier extensión de terceros puede pedirlos por nombre y se quedaría
sin icono. Ahorro real: cinco módulos de icono.

### 2. `getNodeMeta()` no tiene consumidor
Doce senders lo implementan (`{ label, icon: 'AccessTime' }`) y **nadie lo llama**: es opcional en
`ISender`/`IWebhook` y el diseñador de composite resuelve sus tipos con iconos fijos. De ahí que
`AccessTime`, `CallSplit`, `Email` y `Speed` solo estén citados por nombre y no se pinten nunca. O se
cablea en el diseñador, o sobra en la interfaz.

### 3. Deep imports que quedan
`common-front/src/MsgBox.tsx` y `HelpButton.tsx` (`Error`, `Warning`, `Info`, `HelpOutline`).
common-front es la **excepción documentada** a la regla, así que esto es decisión, no deuda: se deja o
se alinea, pero no rompe nada.
