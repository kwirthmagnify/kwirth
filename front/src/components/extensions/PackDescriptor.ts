import { Extension } from '../../icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `pack` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    El plan lo marcaba como candidato a NO migrar, junto con IdP, porque un pack CONTIENE otras extensiones
    y al instalarlo hay que cargar el front de cada una. Migrado, resulta que eso cabe entero en
    `onInstalled` / `onUninstalled`, que es donde ya vivian los efectos de themes y homepages: un pack
    simplemente los dispara en bucle, uno por miembro.

    Lo unico que hubo que añadir al generico es la LINEA DE MIEMBROS ('2 plugins, 1 theme'), que ningun
    otro tipo tiene porque ningun otro contiene nada, y el aviso del boton de desinstalar.

    ⚠️ Un pack no tiene version de dev: se instala entero o no esta. Por eso aqui no hay chip 'dev' ni
    veredicto que lo contemple.
*/

/** An extension the pack brings inside. */
interface IPackExtensionRef {
    extensionType: string
    id: string
    tgz: string
}

interface IPackManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    /** Which types it brings, according to the catalogue: what is inside is unknown until it is installed. */
    extensionTypes?: string[]
}

interface IInstalledPack {
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    extensions: IPackExtensionRef[]
    requiresRestart?: boolean
}

/** What the descriptor needs from the application: loading and unloading each member's front end. */
interface IPackDescriptorDeps {
    onPluginLoad: (id: string) => void
    onPluginUnload: (id: string) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
}

/** '2 plugins, 1 theme': what the pack brings, grouped by type. */
const membersSummary = (extensions: IPackExtensionRef[]): string => {
    const counts: Record<string, number> = {}
    for (const e of extensions) counts[e.extensionType] = (counts[e.extensionType] ?? 0) + 1
    return Object.entries(counts).map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ')
}

const toModel = (e: IInstalledPack | IPackManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledPack).installedFrom,
    marketplaceLabel: e.marketplaceLabel,
    /*
        Que trae el pack. Lleva 'Includes:' delante a proposito: sin el, la linea caia debajo de una
        descripción recortada y se leia como su continuación en vez de como la lista de lo que trae.

        Instalado se sabe lo que hay DENTRO; del catalogo, solo que tipos promete traer.
    */
    subtitle: (e as IInstalledPack).extensions
        ? `Includes: ${membersSummary((e as IInstalledPack).extensions)}`
        : ((e as IPackManifestEntry).extensionTypes?.length ? `Includes: ${(e as IPackManifestEntry).extensionTypes!.join(', ')}` : undefined)
})

// A pack is removed whole, wherever it comes from: there are no dev packs and no packs installed by another pack.
const canUninstall = (): IExtensionVerdict => ({ allowed: true })

/** Walks the pack's members applying to each one what is its own according to its type. */
const forEachMember = (pack: IInstalledPack, deps: IPackDescriptorDeps, cargar: boolean) => {
    for (const ext of pack.extensions) {
        switch (ext.extensionType as EExtensionType) {
            case EExtensionType.PLUGIN:
                if (cargar) deps.onPluginLoad(ext.id)
                else deps.onPluginUnload(ext.id)
                break
            case EExtensionType.THEME:
                if (cargar) deps.onThemeLoad(ext.id)
                else deps.onThemeUnload(ext.id)
                break
            case EExtensionType.HOMEPAGE:
                if (cargar) deps.onHomepageLoad(ext.id)
                else deps.onHomepageUnload(ext.id)
                break
            // The remaining types have no front end to load hot: the back end already serves them.
        }
    }
}

const makePackDescriptor = (deps: IPackDescriptorDeps): IExtensionManagerDescriptor<IInstalledPack, IPackManifestEntry> => ({
    extensionType: EExtensionType.PACK,
    title: 'Manage extension packs',
    noun: { singular: 'pack', plural: 'packs' },
    helpSection: 'guide/extensions/packs/index',
    icon: Extension,
    endpoints: {
        installed: '/core/packs',
        install: '/core/packs/install',
        upload: '/core/packs/upload',
        remove: p => `/core/packs/${p.id}`
    },
    // Removing a pack takes with it everything it brought, and that is warned about BEFORE pressing.
    uninstallTooltip: 'Uninstall pack (removes all member extensions)',
    /*
        El unico tipo que NO se actualiza instalando encima. Instalar un pack rechaza tambien si alguno de
        sus miembros ya esta puesto, asi que reemplazarlo no es reemplazar una extension: es actualizar
        todas las que trae, con sus reinicios y su configuracion. Mientras el back no lo haga, el boton lo
        dice en vez de ofrecer algo que va a fallar.
    */
    updateBlockedReason: () => 'Packs cannot be updated in place — uninstall this pack and install the new version',
    keyOf: e => e.id,
    toModel,
    canUninstall,

    onInstalled: pack => forEachMember(pack, deps, true),
    onUninstalled: pack => forEachMember(pack, deps, false)
})

export { makePackDescriptor }
export type { IInstalledPack, IPackManifestEntry }
