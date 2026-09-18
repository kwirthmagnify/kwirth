import { Extension } from '@kwirthmagnify/kwirth-common-front/icons'
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

/** Una extension que trae el pack dentro. */
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
    /** Que tipos trae, segun el catalogo: lo de dentro no se conoce hasta instalarlo. */
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

/** Lo que el descriptor necesita de la aplicacion: cargar y descargar el front de cada miembro. */
interface IPackDescriptorDeps {
    onPluginLoad: (id: string) => void
    onPluginUnload: (id: string) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
}

/** '2 plugins, 1 theme': que trae el pack, agrupado por tipo. */
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

// Un pack se quita entero, venga de donde venga: no hay packs de dev ni packs instalados por otro pack.
const canUninstall = (): IExtensionVerdict => ({ allowed: true })

/** Recorre los miembros del pack aplicando a cada uno lo suyo segun su tipo. */
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
            // Los demas tipos no tienen front que cargar en caliente: el back ya los sirve.
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
    // Quitar un pack se lleva por delante todo lo que trajo, y eso se avisa ANTES de pulsar.
    uninstallTooltip: 'Uninstall pack (removes all member extensions)',
    keyOf: e => e.id,
    toModel,
    canUninstall,

    onInstalled: pack => forEachMember(pack, deps, true),
    onUninstalled: pack => forEachMember(pack, deps, false)
})

export { makePackDescriptor }
export type { IInstalledPack, IPackManifestEntry }
