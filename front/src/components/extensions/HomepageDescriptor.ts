import React from 'react'
import { Home } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `homepage` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Lo que aporta el tipo:
      · el chip `active` de la homepage en uso
      · el engranaje, que aqui NO es del tipo sino de la tarjeta: solo la homepage activa se configura, y
        solo si su extension trae un SetupDialog propio
      · desactivar al desinstalar la que estaba puesta
      · cargar/descargar su front en caliente

    ⚠️ El dialogo de configuracion no lo pone el core: lo trae la propia homepage en
    `window.__kwirth_homepages__[id].SetupDialog`, y su configuracion vive en localStorage. El core solo
    decide CUANDO se abre; lo que se pinta dentro es de la extension. Por eso aqui se monta con
    `createElement` y el fichero sigue siendo .ts: un descriptor declara, no maqueta.
*/

interface IHomepageManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
}

interface IInstalledHomepage {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
}

/** Lo que el descriptor necesita de la aplicacion. */
interface IHomepageDescriptorDeps {
    activeHomepageId: string | undefined
    onActivate: (id: string | undefined, config: Record<string, unknown>) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
}

/** Las props del dialogo que trae la propia homepage. */
interface IHomepageSetupProps {
    config: Record<string, unknown>
    onSave: (cfg: Record<string, unknown>) => void
    onClose: () => void
}

/** El front de una homepage instalada, que el core carga en una global. */
interface ILoadedHomepage {
    SetupDialog?: React.ComponentType<IHomepageSetupProps>
    defaultConfig?: Record<string, unknown>
}

const loadedHomepage = (id: string): ILoadedHomepage | undefined =>
    (window as unknown as { __kwirth_homepages__?: Record<string, ILoadedHomepage> }).__kwirth_homepages__?.[id]

/** La configuracion guardada de una homepage, o la que ella misma propone por defecto. */
const savedConfig = (id: string): Record<string, unknown> => {
    try {
        const saved = localStorage.getItem(`kwirth.homepage.config.${id}`)
        if (saved) return JSON.parse(saved) as Record<string, unknown>
    }
    catch { /* localStorage puede fallar o traer basura: se cae a lo que proponga la extension */ }
    return loadedHomepage(id)?.defaultConfig ?? {}
}

const toModel = (e: IInstalledHomepage | IHomepageManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledHomepage).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (h: IInstalledHomepage): IUninstallVerdict => {
    if (h.installedFrom === 'dev') return { allowed: false, reason: 'Dev homepages cannot be uninstalled' }
    if (h.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makeHomepageDescriptor = (deps: IHomepageDescriptorDeps): IExtensionManagerDescriptor<IInstalledHomepage, IHomepageManifestEntry> => ({
    extensionType: EExtensionType.HOMEPAGE,
    title: 'Manage homepages',
    noun: { singular: 'homepage', plural: 'homepages' },
    helpSection: 'guide/extensions/homepages/index?id=admin-guide',
    icon: Home,
    endpoints: {
        installed: '/core/homepages',
        install: '/core/homepages/install',
        upload: '/core/homepages/upload',
        remove: h => `/core/homepages/${h.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    extraChips: (e, section): IExtensionChip[] =>
        section === EManagerSection.INSTALLED && deps.activeHomepageId === e.id
            ? [{ label: 'active', color: 'primary', icon: EChipIcon.ACTIVE }]
            : [],

    // El engranaje es de la TARJETA, no del tipo: solo la homepage activa se reconfigura, y solo si su
    // extension trae dialogo. Para las demas no hay nada que abrir.
    canConfigure: h => deps.activeHomepageId === h.id && Boolean(loadedHomepage(h.id)?.SetupDialog),

    renderConfigDialog: (h, onClose) => {
        const SetupDialog = loadedHomepage(h.id)?.SetupDialog
        if (!SetupDialog) return null
        return React.createElement(SetupDialog, {
            config: savedConfig(h.id),
            onSave: (cfg: Record<string, unknown>) => { deps.onActivate(h.id, cfg); onClose() },
            onClose
        })
    },

    onInstalled: meta => deps.onHomepageLoad(meta.id),
    onUninstalled: h => {
        // Si se desinstala la que estaba puesta, hay que DESACTIVARLA: si no, Kwirth se queda apuntando a
        // una homepage que ya no existe y la pantalla de inicio se queda en blanco.
        if (deps.activeHomepageId === h.id) deps.onActivate(undefined, {})
        deps.onHomepageUnload(h.id)
    }
})

export { makeHomepageDescriptor }
export type { IInstalledHomepage, IHomepageManifestEntry }
