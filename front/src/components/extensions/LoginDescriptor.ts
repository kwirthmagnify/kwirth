import React from 'react'
import { Launch, LockPerson } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionAction, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'
import { ConfigFormDialog } from './ConfigFormDialog'

/*
    The `login` type's descriptor for the generic manager (plan: plans/extension-managers-ui/PLAN.md).

    What the type brings, and only that:
      · opening that login's page in another tab, to see it WITHOUT logging out
      · its configuration, hot, when the extension declares a `configSchema`

    Everything else —the two sections, the filter, card/list, the versions, installing from
    catalogue/URL/file and the provenance chips— is put there by ExtensionManagerDialog.
*/

interface ILoginManifestEntry {
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

interface IInstalledLogin {
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
    configSchema?: IConfigFieldDef[]
}

const toModel = (e: IInstalledLogin | ILoginManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledLogin).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (l: IInstalledLogin): IExtensionVerdict => {
    if (l.installedFrom === 'dev') return { allowed: false, reason: 'Dev login extensions cannot be uninstalled' }
    if (l.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

/*
    Opens that login's page in another tab, to see it without logging out.

    The address is the SAME one whoever is looking came in through —origin and path, which is not always
    the root: Kwirth is also served under a rootPath— plus ?loginExt=<id>, which is how the front end
    decides to paint an extension's login instead of its own. It is the same shape LoginExtensionPage
    builds for its returnTo, not a new convention.
*/
const openLoginPage = (id: string) => {
    window.open(`${window.location.origin}${window.location.pathname}?loginExt=${encodeURIComponent(id)}`, '_blank', 'noopener')
}

const loginDescriptor: IExtensionManagerDescriptor<IInstalledLogin, ILoginManifestEntry> = {
    extensionType: EExtensionType.LOGIN,
    title: 'Manage login extensions',
    noun: { singular: 'login extension', plural: 'login extensions' },
    helpSection: 'guide/extensions/logins/index',
    icon: LockPerson,
    endpoints: {
        installed: '/core/logins',
        install: '/core/logins/install',
        upload: '/core/logins/upload',
        remove: l => `/core/logins/${l.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // Installed only: a login page that is not installed yet cannot be opened.
    actions: (e, section): IExtensionAction[] => section === EManagerSection.INSTALLED
        ? [{
            icon: React.createElement(Launch, { fontSize: 'small' }),
            tooltip: 'Open login page in new tab',
            color: 'primary',
            onClick: () => openLoginPage((e as IInstalledLogin).id)
          }]
        : [],

    // The gear belongs to the CARD: it is only alive on the logins that declare configuration.
    canConfigure: l => (l.configSchema?.length ?? 0) > 0
        ? { allowed: true }
        : { allowed: false, reason: 'This login extension has no settings' },
    renderConfigDialog: (l, onClose) => React.createElement(ConfigFormDialog, {
        title: `Configure — ${l.displayName || l.name}`,
        helpSection: 'guide/extensions/logins/index?id=runtime-configuration',
        schema: l.configSchema ?? [],
        endpoint: `/core/logins/${l.id}/config`,
        onClose
    })
}

export { loginDescriptor }
export type { IInstalledLogin, ILoginManifestEntry }
