import React from 'react'
import { Description, Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionAction, IExtensionManagerDescriptor, IExtensionCardModel, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `docs` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Es el tipo que motivo que el generico tenga `keyOf` y no diera por hecho el `id`: una documentacion se
    identifica por el PAR (targetType, id), porque el id es el de la extension DOCUMENTADA y se repite
    entre tipos — un plugin y un theme pueden llamarse igual y traer cada uno su guia. Esa clave compuesta
    es la que usa el catalogo para agrupar versiones, la que decide si algo ya esta instalado y la que
    arma la ruta de borrado.

    Lo demas que aporta el tipo: abrir la documentacion en otra pestaña.
*/

// El id es el de la extension documentada; el par con targetType es lo que la identifica.
interface IDocsManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    targetType: string
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
}

interface IDocsMeta {
    id: string
    targetType: string
    // 'name' es el nombre del PAQUETE (npm) y 'displayName' el humano, igual que en los otros diez tipos.
    // Mientras las docs solo venian de dev, el tgz metia el nombre humano en 'name' y colaba; en cuanto
    // una se instala desde un registro, 'name' es el scope y hay que pintar 'displayName'.
    name: string
    displayName?: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
}

const toModel = (e: IDocsMeta | IDocsManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IDocsMeta).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (d: IDocsMeta): IUninstallVerdict => {
    // La documentacion del core viene DENTRO de la imagen: no hay nada que borrar, y si se borrara Kwirth
    // se quedaria sin ayuda.
    if (d.installedFrom === 'bundled') return { allowed: false, reason: 'Bundled documentation cannot be uninstalled' }
    if (d.installedFrom === 'dev') return { allowed: false, reason: 'Dev documentation cannot be uninstalled' }
    return { allowed: true }
}

/**
 * Factoria porque abrir la documentacion necesita la direccion del back: se sirve desde el propio Kwirth,
 * no desde una web externa.
 */
const makeDocsDescriptor = (backendUrl: string): IExtensionManagerDescriptor<IDocsMeta, IDocsManifestEntry> => ({
    extensionType: EExtensionType.DOCS,
    title: 'Manage documentation',
    noun: { singular: 'documentation package', plural: 'documentation packages' },
    helpSection: 'guide/extensions/docs/index?id=admin-guide',
    icon: Description,
    endpoints: {
        installed: '/core/docs',
        install: '/core/docs/install',
        upload: '/core/docs/upload',
        remove: d => `/core/docs/${d.targetType}/${d.id}`
    },
    keyOf: e => `${e.targetType}/${e.id}`,
    toModel,
    canUninstall,

    actions: (e, section): IExtensionAction[] => section === EManagerSection.INSTALLED
        ? [{
            icon: React.createElement(Launch, { fontSize: 'small' }),
            tooltip: 'Open in new tab',
            color: 'primary',
            onClick: () => window.open(`${backendUrl}/core/docs/${e.targetType}/${e.id}/`, '_blank', 'noopener')
          }]
        : []
})

export { makeDocsDescriptor }
export type { IDocsMeta, IDocsManifestEntry }
