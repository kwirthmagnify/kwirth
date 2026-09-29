# In-place Extension Upgrade — Plan

> **ESTADO — CERRADO** (2026-09-23). Se puede actualizar desde la UI, en los once tipos y en las dos
> vistas, sin desinstalar y sin perder la configuración. Lo de abajo se deja tal cual estaba escrito el
> 2026-09-04 —el plan es append-only—; lo que se hizo, y en qué se apartó de lo propuesto, está en
> [Cierre](#cierre-2026-09-23).
> Registro de **por qué** se hizo así, no de cómo funciona hoy: para eso manda el código y la guía.
> Si algo de aquí contradice lo que ves en el producto, gana el producto. El plan no se borra —
> es append-only —, se marca.

## Status (2026-09-04) — NOT STARTED

Detection is done; acting on it is not. Kwirth now tells the user which installed extensions have a
newer version in the marketplace, but there is no way to upgrade from the UI: the only path is
uninstall + reinstall, which discards the extension's stored configuration.

## What exists today

The update check lives in `front/src/App.tsx`, inside the `useEffect` keyed on `[logged, backendUrl]`:

- Runs in **every environment** (the old `NODE_ENV !== 'production'` gate was removed), governed by the
  user setting `checkExtensionUpdates` (`front/src/model/Settings.ts`, checkbox in
  `front/src/components/settings/SettingsUser.tsx`, default on).
- Compares all **10 extension types** — plugin, sender, provider, theme, homepage, webhook, login, pack,
  docs, idp — against their GitHub `manifest.json`, skipping `installedFrom === 'dev'` and entries with
  no version. `idp` reads from `/idp/connectors`; the rest from `/core/<type>`.
- Surfaces one aggregated `notify(undefined, ENotifyLevel.WARNING, 'Updates available: …')`, which
  renders as the orange snackbar and persists in the notification bell list.

It fires **once per login**. There is no periodic re-check and no re-check when a manager dialog opens.

## What is missing

1. **No in-place upgrade.** In `PluginManagerDialog.tsx` the Install button is hard-disabled for an id
   that is already installed, with the tooltip `'Already installed — uninstall first'`. The same pattern
   repeats in the sibling manager dialogs (sender, provider, theme, homepage, webhook, login, pack, idp).
   Upgrading therefore means uninstall + reinstall, losing the extension's config.
2. **The notice is far from the action.** The warning is a transient toast plus a bell entry. The place
   the user actually reads a version — the installed card in the manager dialog — shows no indication
   that a newer one exists. `PluginCard` already declares a `badge` prop that is unused for installed
   items, which is the natural hook.

## Proposed steps

- **A — Badge.** Surface "update available" on the installed card of every manager dialog, reusing the
  same manifest-vs-installed comparison the App.tsx check performs. Extract that comparison into a shared
  helper so the dialogs and the startup check cannot drift apart.
- **B — Upgrade action.** Replace the hard-disabled Install button with an Upgrade action when the
  manifest version is greater, wired to an install path that **preserves stored config** rather than
  going through uninstall. Needs a decision per type on where config lives and whether a restart is
  required (several install paths already return `requiresRestart`).
- **C — Re-check on dialog open.** Compare on mount of each manager dialog, so the state is fresh when
  the user is actually looking at it, not only from the once-per-login startup check.

## Cierre (2026-09-23)

Entregado en un solo stream. **A** y **B** hechos con una decisión de diseño distinta a la propuesta,
**C** resultó estar ya hecho.

### Lo que se hizo

**El back ya sabía reemplazar; solo faltaba dejarle.** El cuerpo de `install()` de los once managers ya
hacía todo lo que hace falta para una actualización —`dropCachedExtensionFiles`, `index[existingIdx] = meta`
en vez de `push`, y `delete require.cache` antes de volver a cargar el módulo del back—. Lo único que lo
impedía era un guardián copiado nueve veces que rechazaba cualquier id ya instalada. El paso B no necesitó
"un camino de instalación que preserve la configuración": necesitó **permiso**.

Ese permiso es explícito y viaja en el POST (`upgrade: true`), y el guardián pasa a vivir en un solo sitio,
`back/src/tools/ExtensionInstallGuard.ts`. Explícito y no implícito porque un install accidental sobre una id
existente no puede reemplazarla por su cuenta: el comportamiento de siempre se conserva cuando nadie pide
otra cosa.

**Solo hacia adelante.** El guardián rechaza la misma versión y cualquier anterior. Volver atrás dejaría la
configuración —que nadie reescribe— pensada para una versión que ya no está, que es peor sitio que aquel del
que se quería salir. También rechaza cuando falta alguna de las dos versiones, que es el caso de lo montado
desde `kwirth-dev.json`: sin saber de dónde se viene no se puede saber si se avanza.

**Lo instalado pasa a ser exactamente lo que trae el paquete.** Esto no estaba en el plan y es la mitad del
trabajo. Varias escrituras eran condicionales (`if (meta.frontStored) write(...)`), y saltarse una no deja
la clave vacía: la deja con el contenido de la versión **anterior**. Un login que deja de traer fondo seguía
pintando el de antes; un sender cuyo front deja de caber en el ConfigMap seguía sirviendo el viejo; un
provider que retira su esquema seguía enseñando su formulario. Las seis pasan a `write(clave, cabe ? valor : null)`,
que borra. `DocsManager` ya era correcto por otra vía —borra su carpeta de destino antes de extraer— y sirvió
de modelo.

### En qué se apartó de lo propuesto

- **A — badge → botón siempre visible.** En vez de un distintivo en la tarjeta, la acción **es** la señal: el
  botón de update está siempre, y cuando hay versión nueva se pinta **habilitado y en azul** frente al gris
  del resto, que es la misma lectura de un vistazo que buscaba el badge, sin añadir un elemento más a una
  tarjeta que ya lleva dos grupos de chips. Y está **siempre**, no solo cuando hay algo que actualizar,
  porque un botón que aparece y desaparece mueve la papelera de la fila siguiente al sitio donde estaba el
  update de la anterior.
- **A — el helper compartido no se extrajo.** La propuesta pedía sacar la comparación manifest-vs-instalado a
  un sitio común para que el diálogo y el chequeo del arranque no divergieran. No hizo falta: lo que podría
  divergir es el **criterio de orden**, y eso ya vive en un solo sitio (`versionGreaterThan`). Lo que queda
  duplicado es de dónde sale cada lista, que es distinto a propósito — el diálogo ya tiene su catálogo
  cargado y el arranque pide los diez.
- **C — ya estaba hecho.** `ExtensionManagerDialog` llama a `fetchManifest()` en su `useEffect` de montaje
  desde la unificación de los once gestores, así que el catálogo ya se resuelve al abrir el diálogo.
- **El aviso de reinicio era un caso más, no el mismo.** `ERestartAction` tenía dos valores y el texto de
  instalar ("no funcionará hasta que reinicies") es **falso** tras una actualización: la extensión sigue
  funcionando, lo que pasa es que la que corre es la de antes. Se añade `UPDATE` con su texto, y el aviso
  se dispara mirando `requiresRestart` en **las dos**, la que se va y la que llega — el router de la vieja
  sigue montado aunque la nueva ya no declare ninguno.
- **Los packs quedan fuera, diciéndolo.** Instalar un pack rechaza también si cualquiera de sus miembros está
  puesto, así que reemplazarlo significa actualizar todo lo que trajo. El descriptor gana
  `updateBlockedReason` y el botón lo explica, en vez de ofrecer algo que iba a fallar.

### Alcance y verificación

Un solo sitio en el front (`ExtensionManagerDialog`, el genérico) cubre los **once tipos × dos vistas**.
**+14 tests** —el guardián suelto, y de punta a punta sobre `LoginManager` y `SenderManager`: que el fondo
y el front de la versión anterior desaparecen, y que no se borra de más cuando la nueva sí los trae— y
**+1 spec e2e con 6 casos** que no pulsa ningún update y fija en una lista los ocho tooltips posibles.

De paso salió un defecto del propio e2e: `extension-catalogs` usaba `isVisible({ timeout })`, que **no
espera** por mucho timeout que se le pase, así que los últimos de los once diálogos se preguntaban con la
máquina cargada y contestaban que no había catálogo cuando lo que faltaba era un pintado.

### Queda anotado, fuera de este plan

- `ProviderManager.install()` asigna `meta.hasSchema = true` **después** de haber persistido el meta y el
  índice, así que el valor no llega a guardarse nunca. Es previo a este trabajo y no lo toca.

## Notes / gotchas

- `versionGreaterThan` (`common/src/Version.ts`) parses numerically per dot-segment, so `0.2.20 > 0.2.19`
  is correct. It collapses non-numeric segments to their numeric prefix, so `1.0.0-rc1` compares equal to
  `1.0.0` and would never be flagged — relevant if pre-release versions ever reach a manifest.
- Manifests are fetched from `raw.githubusercontent.com/.../master`, so an air-gapped or proxied
  in-cluster deployment silently degrades to "no updates" (every fetch failure resolves to `[]`).
- Paid artifacts never reach a public manifest, so they will never be flagged. `webhooks/manifest.json`
  exists but is empty for exactly this reason (only `jira`, which is paid).
