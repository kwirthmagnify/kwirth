import React from 'react'
import { Key } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'
import { IdpConfigDialog, IIdpInstance } from './IdpConfigDialog'

/*
    The `idp` type's descriptor for the generic manager (plan: plans/completed/extension-managers-ui/PLAN.md).

    The plan marked it as the best candidate NOT to migrate, because it has TWO entities: the connector,
    which is what gets installed, and the instance, which is that connector already configured. Reading
    it through, the relationship turns out to be 1:1 —there is one instance per connector and they share
    an id— so on the screen they behave like an extension and its configuration, just like the rest.

    What the type brings:
      · the status chip, which is the first thing looked at here: enabled / disabled / not configured. An
        IdP that is configured but switched off and one that is not configured look different, because
        they are different things.
      · its configuration, which is the instance (see IdpConfigDialog).
      · that it does NOT hang off /core/<plural>: the connectors live under /idp, hence the model having
        the endpoints explicit rather than guessing them.
*/

interface IIdpConnector {
    id: string
    label: string
    kind: string
    schema: IConfigFieldDef[]
    /** false on the bundled and dev ones: they come inside and are not uninstalled. */
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

/** What the descriptor needs from the application: reading the configured IdPs (it goes authenticated). */
interface IIdpDescriptorDeps {
    loadInstances: () => Promise<IIdpInstance[]>
}

/*
    The configured instances, indexed by their connector's id.

    They live in the module and not in the generic one's state: they are data the generic one neither
    knows nor has any reason to know. They are loaded in `loadExtraData`, and the generic one repaints
    when that load finishes.
*/
let instancias: Record<string, IIdpInstance> = {}

const toModel = (e: IIdpConnector | IIdpConnectorManifestEntry): IExtensionCardModel => {
    const conector = e as IIdpConnector
    return {
        // A connector presents itself by its LABEL, which is the name it is known by ('Microsoft Entra
        // ID'); the catalogue's one is not installed yet and only has the package's.
        name: conector.label || (e as IIdpConnectorManifestEntry).displayName || (e as IIdpConnectorManifestEntry).name || e.id,
        version: e.version ?? '',
        // With no description, at least WHAT it is gets said: its id and its type (oidc, saml…).
        description: e.description || (conector.kind ? `${e.id} · ${conector.kind}` : ''),
        website: e.website,
        installedFrom: conector.installedFrom,
        marketplaceLabel: e.marketplaceLabel
    }
}

/*
    ⚠️ Here `installed` does not mean "it is in the list": it means it was installed AS AN EXTENSION. A
    bundled or dev connector comes inside Kwirth, shows up in the list and cannot be removed.
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

    /*
        ⚠️ The map is replaced WHOLE at the end, and it is not emptied before asking for the data.

        Emptying it first left a gap —the request's duration— in which any repaint painted every
        connector as 'not configured'. It showed when saving an IdP's configuration: the chip jumped
        through an intermediate state that did not exist.
    */
    loadExtraData: async () => {
        const mapa: Record<string, IIdpInstance> = {}
        for (const inst of await deps.loadInstances()) mapa[inst.id] = inst
        instancias = mapa
    },

    /*
        The instance's status, which is the first thing looked at on this screen: an IdP switched on, one
        configured but switched off and one untouched are three different situations and all three matter.
    */
    extraChips: (e, section): IExtensionChip[] => {
        if (section !== EManagerSection.INSTALLED) return []
        const inst = instancias[e.id]
        if (inst?.enabled) return [{ label: 'enabled', color: 'success', icon: EChipIcon.ACTIVE }]
        if (inst) return [{ label: 'disabled', variant: 'outlined' }]
        return [{ label: 'not configured', variant: 'outlined', color: 'warning' }]
    },

    // A connector with no fields has nothing to fill in; the rest can always be configured, whether they
    // already have an instance or not — creating one IS configuring it.
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
