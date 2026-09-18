import React from 'react'
import { Key } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'
import { IdpConfigDialog, IIdpInstance } from './IdpConfigDialog'

/*
    Descriptor del tipo `idp` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    El plan lo marcaba como el mejor candidato a NO migrar, por tener DOS entidades: el conector, que es
    lo que se instala, y la instancia, que es ese conector ya configurado. Leyendolo entero resulta que la
    relacion es 1:1 —hay una instancia por conector y comparten id— asi que en la pantalla se comportan
    como una extension y su configuracion, igual que las demas.

    Lo que aporta el tipo:
      · el chip de estado, que es lo primero que se mira aqui: enabled / disabled / not configured. Un
        IdP configurado pero apagado y uno sin configurar se ven distinto, porque son cosas distintas.
      · su configuracion, que es la instancia (ver IdpConfigDialog).
      · que NO cuelga de /core/<plural>: los conectores viven bajo /idp, y de ahi que el modelo tenga los
        endpoints explicitos en vez de adivinarlos.
*/

interface IIdpConnector {
    id: string
    label: string
    kind: string
    schema: IConfigFieldDef[]
    /** false en los bundled y los de dev: vienen dentro y no se desinstalan. */
    installed: boolean
    version?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    website?: string
    description?: string
    requiresRestart?: boolean
}

interface IIdpConnectorManifestEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
    marketplaceId?: string
    marketplaceLabel?: string
}

/** Lo que el descriptor necesita de la aplicacion: leer los IdP configurados (va autenticado). */
interface IIdpDescriptorDeps {
    loadInstances: () => Promise<IIdpInstance[]>
}

/*
    Las instancias configuradas, indexadas por el id de su conector.

    Viven en el modulo y no en el estado del generico: son datos que el generico no conoce ni tiene por
    que conocer. Se cargan en `loadExtraData`, y el generico repinta cuando esa carga termina.
*/
let instancias: Record<string, IIdpInstance> = {}

const toModel = (e: IIdpConnector | IIdpConnectorManifestEntry): IExtensionCardModel => {
    const conector = e as IIdpConnector
    return {
        // Un conector se presenta por su LABEL, que es el nombre con el que se le conoce ('Microsoft
        // Entra ID'); el del catalogo todavia no esta instalado y solo tiene el del paquete.
        name: conector.label || (e as IIdpConnectorManifestEntry).displayName || (e as IIdpConnectorManifestEntry).name || e.id,
        version: e.version ?? '',
        // Sin descripcion se dice al menos QUE es: su id y de que tipo (oidc, saml…).
        description: e.description || (conector.kind ? `${e.id} · ${conector.kind}` : ''),
        website: e.website,
        installedFrom: conector.installedFrom,
        marketplaceLabel: e.marketplaceLabel
    }
}

/*
    ⚠️ Aqui `installed` no significa "esta en la lista": significa que se instalo COMO EXTENSION. Un
    conector bundled o de dev viene dentro de Kwirth, sale en la lista y no se puede quitar.
*/
const canUninstall = (c: IIdpConnector): IExtensionVerdict => {
    if (!c.installed) return { allowed: false, reason: 'Bundled/dev connector (cannot be uninstalled)' }
    if (c.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makeIdpDescriptor = (deps: IIdpDescriptorDeps): IExtensionManagerDescriptor<IIdpConnector, IIdpConnectorManifestEntry> => ({
    extensionType: EExtensionType.IDP,
    title: 'Identity providers',
    noun: { singular: 'connector', plural: 'connectors' },
    helpSection: 'guide/admin/07-idp-integration?id=enabling-an-idp',
    icon: Key,
    endpoints: {
        installed: '/idp/connectors',
        install: '/idp/connectors/install',
        upload: '/idp/connectors/upload',
        remove: c => `/idp/connectors/${c.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    loadExtraData: async () => {
        instancias = {}
        for (const inst of await deps.loadInstances()) instancias[inst.id] = inst
    },

    /*
        El estado de la instancia, que es lo primero que se mira en esta pantalla: un IdP encendido, uno
        configurado pero apagado y uno sin tocar son tres situaciones distintas y las tres importan.
    */
    extraChips: (e, section): IExtensionChip[] => {
        if (section !== EManagerSection.INSTALLED) return []
        const inst = instancias[e.id]
        if (inst?.enabled) return [{ label: 'enabled', color: 'success', icon: EChipIcon.ACTIVE }]
        if (inst) return [{ label: 'disabled', variant: 'outlined' }]
        return [{ label: 'not configured', variant: 'outlined', color: 'warning' }]
    },

    // Un conector sin campos no tiene nada que rellenar; el resto siempre se puede configurar, tenga ya
    // instancia o no — crearla ES configurarlo.
    canConfigure: c => c.schema.length > 0
        ? { allowed: true }
        : { allowed: false, reason: 'This connector has no configurable options' },

    renderConfigDialog: (c, onClose) => React.createElement(IdpConfigDialog, {
        connectorId: c.id,
        connectorLabel: c.label,
        schema: c.schema,
        existing: instancias[c.id],
        onClose
    })
})

export { makeIdpDescriptor }
export type { IIdpConnector, IIdpConnectorManifestEntry }
