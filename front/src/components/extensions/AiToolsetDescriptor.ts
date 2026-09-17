import { Construction } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `aitoolset` (plan: plans/ai-tools/PLAN.md) y PRIMER cliente del gestor generico.
    Se estreno aqui a proposito: era el unico tipo sin diálogo propio, asi que estrenarlo no podia romper
    nada de lo que ya funcionaba.

    Las dos secciones, el filtro, tarjeta/lista, el Select de version, instalar desde catalogo/URL/fichero,
    la procedencia y el selector de plugins los pone ExtensionManagerDialog.
*/

interface IAiToolsetEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    installedFrom?: string
    requiresRestart?: boolean
    /** Solo en lo instalado: cuantas tools trae, para el chip. Lo rellena el catalogo del back. */
    toolCount?: number
}

/** Lo que el descriptor necesita de la aplicacion para leer y guardar las concesiones. */
interface IAiToolsetDescriptorDeps {
    loadGrants: () => Promise<Record<string, string[]>>
    saveGrants: (toolsetId: string, pluginIds: string[]) => Promise<void>
}

const toModel = (e: IAiToolsetEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: e.installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

// Un toolset built-in del core no se instala ni se desinstala: viene dentro. Y uno de dev lo gobierna
// kwirth-dev.json, no el diálogo.
const canUninstall = (e: IAiToolsetEntry): IUninstallVerdict => {
    if (e.installedFrom === 'dev') return { allowed: false, reason: 'Dev toolsets cannot be uninstalled' }
    if (e.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in toolsets cannot be uninstalled' }
    if (e.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makeAiToolsetDescriptor = (deps: IAiToolsetDescriptorDeps): IExtensionManagerDescriptor<IAiToolsetEntry, IAiToolsetEntry> => ({
    extensionType: EExtensionType.AITOOLSET,
    title: 'Manage AI toolsets',
    noun: { singular: 'AI toolset', plural: 'AI toolsets' },
    // La guia del tipo ya existe (CL9 2026-09-16), asi que el dialogo lleva su boton de ayuda (regla 7).
    // Apunta a la seccion del manager, no al principio de la pagina: quien abre la ayuda DESDE el dialogo
    // quiere lo que esta viendo, no la introduccion al concepto.
    helpSection: 'guide/extensions/aitoolsets/index?id=the-ai-toolsets-manager',
    icon: Construction,
    endpoints: {
        installed: '/core/aitoolsets',
        install: '/core/aitoolsets/install',
        upload: '/core/aitoolsets/upload',
        remove: e => `/core/aitoolsets/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    /*
        LA CONCESION: que plugins pueden usar este toolset (plan: "El techo en dos fases", fase 1).

        Se concede desde el TOOLSET y no desde el plugin porque lo peligroso es el toolset: `k8s-ops` son
        las ocho tools de escritura, y asi "¿quien puede escribir en el cluster por IA?" se responde en UNA
        pantalla, en vez de recorriendo los canales instalados uno a uno.

        ⚠️ Por defecto no lo usa nadie: instalar deja el toolset disponible, no concedido. De ahi que el
        control diga 'No plugin' en vez de quedarse en blanco.
    */
    pluginSelector: {
        tooltip: 'Plugins allowed to use this toolset',
        load: deps.loadGrants,
        save: (toolset, pluginIds) => deps.saveGrants(toolset.id, pluginIds)
    },

    extraChips: (e, section): IExtensionChip[] =>
        section === EManagerSection.INSTALLED && e.toolCount !== undefined
            ? [{ label: `${e.toolCount} tool${e.toolCount > 1 ? 's' : ''}`, variant: 'outlined' }]
            : []
})

export { makeAiToolsetDescriptor }
export type { IAiToolsetEntry }
