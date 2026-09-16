import React from 'react'
import { Chip } from '@mui/material'
import { Construction } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { compactChip } from './MarketplaceBadge'
import { IExtensionManagerDescriptor, IExtensionCardModel, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `aitoolset` (plan: plans/ai-tools/PLAN.md, S1) y PRIMER cliente del gestor
    generico. Se estrena aqui a proposito: es el unico tipo sin diálogo propio, asi que estrenarlo no
    puede romper nada de lo que ya funciona.

    Sin diálogo propio: todo lo que se ve —las dos secciones, el filtro, tarjeta/lista, el Select de
    version, instalar desde catalogo/URL/fichero, la procedencia— lo pone ExtensionManagerDialog.
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

const aiToolsetDescriptor: IExtensionManagerDescriptor<IAiToolsetEntry, IAiToolsetEntry> = {
    extensionType: EExtensionType.AITOOLSET,
    title: 'Manage AI toolsets',
    noun: { singular: 'AI toolset', plural: 'AI toolsets' },
    // La guia del tipo ya existe (CL9 2026-09-16), asi que el dialogo lleva su boton de ayuda (regla 7).
    // Apunta a la seccion del manager, no al principio de la pagina: quien abre la ayuda DESDE el dialogo
    // quiere lo que esta viendo, no la introduccion al concepto.
    helpSection: 'guide/extensions/aitoolsets/index?id=the-ai-toolsets-manager',
    icon: <Construction fontSize='small' />,
    endpoints: {
        installed: '/core/aitoolsets',
        install: '/core/aitoolsets/install',
        upload: '/core/aitoolsets/upload',
        remove: e => `/core/aitoolsets/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,
    extraChips: e => e.toolCount === undefined ? [] : [
        <Chip key='tools' label={`${e.toolCount} tool${e.toolCount > 1 ? 's' : ''}`} size='small' variant='outlined' sx={compactChip} />
    ]
}

export { aiToolsetDescriptor }
export type { IAiToolsetEntry }
