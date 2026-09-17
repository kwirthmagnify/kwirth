import React from 'react'
import { Chip, Tooltip } from '@mui/material'
import { CheckCircle, FolderOpen, Home } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { compactChip } from './MarketplaceBadge'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `homepage` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Segundo manager a medida migrado, despues de themes. Lo que aporta el tipo:
      · el chip `active` de la homepage en uso
      · el engranaje, que aqui NO es del tipo sino de la tarjeta: solo la homepage activa se configura, y
        solo si su extension trae un SetupDialog propio
      · desactivar al desinstalar la que estaba puesta
      · cargar/descargar su front en caliente

    ⚠️ El dialogo de configuracion no lo pone el core: lo trae la propia homepage en
    `window.__kwirth_homepages__[id].SetupDialog`, y su configuracion vive en localStorage. El core solo
    decide CUANDO se abre; lo que se pinta dentro es de la extension.
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

/** El front de una homepage instalada, que el core carga en una global. */
interface ILoadedHomepage {
    SetupDialog?: React.ComponentType<{
        config: Record<string, unknown>
        onSave: (cfg: Record<string, unknown>) => void
        onClose: () => void
    }>
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

/*
    De donde vino lo instalado, en chip. El icono de procedencia y el chip de marketplace los pone el
    generico; esto es el matiz que homepages enseñaba ademas: dev, fichero local, pack o Kwirth.
*/
const sourceChip = (installedFrom?: string): React.ReactNode => {
    if (!installedFrom) return undefined
    if (installedFrom === 'dev') return <Chip key='src' label='dev' size='small' variant='outlined' color='warning' sx={compactChip} />
    if (installedFrom === 'local') return <Chip key='src' icon={<FolderOpen />} label='Local file' size='small' variant='outlined' sx={compactChip} />
    if (installedFrom.startsWith('pack:')) {
        return <Tooltip key='src' title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' sx={compactChip} /></Tooltip>
    }
    if (installedFrom.includes('github.com/kwirthmagnify')) return <Chip key='src' icon={<Home />} label='Kwirth' size='small' variant='outlined' color='primary' sx={compactChip} />
    return undefined
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
    icon: <Home fontSize='small' />,
    endpoints: {
        installed: '/core/homepages',
        install: '/core/homepages/install',
        upload: '/core/homepages/upload',
        remove: h => `/core/homepages/${h.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    extraChips: (e, section) => {
        if (section !== EManagerSection.INSTALLED) return []
        const chips: React.ReactNode[] = []
        if (deps.activeHomepageId === e.id) {
            chips.push(<Chip key='active' label='active' size='small' color='primary' icon={<CheckCircle />} sx={compactChip} />)
        }
        const src = sourceChip((e as IInstalledHomepage).installedFrom)
        if (src) chips.push(src)
        return chips
    },

    // El engranaje es de la TARJETA, no del tipo: solo la homepage activa se reconfigura, y solo si su
    // extension trae dialogo. Para las demas no hay nada que abrir.
    canConfigure: h => deps.activeHomepageId === h.id && Boolean(loadedHomepage(h.id)?.SetupDialog),

    renderConfigDialog: (h, onClose) => {
        const SetupDialog = loadedHomepage(h.id)?.SetupDialog
        if (!SetupDialog) return null
        return <SetupDialog
            config={savedConfig(h.id)}
            onSave={cfg => { deps.onActivate(h.id, cfg); onClose() }}
            onClose={onClose}
        />
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
