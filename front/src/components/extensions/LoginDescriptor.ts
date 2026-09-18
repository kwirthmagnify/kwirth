import React from 'react'
import { Launch, LockPerson } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionAction, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'
import { ConfigFormDialog } from './ConfigFormDialog'

/*
    Descriptor del tipo `login` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Lo que aporta el tipo, y solo eso:
      · abrir la pagina de ese login en otra pestaña, para verla SIN cerrar la sesion
      · su configuracion en caliente, cuando la extension declara `configSchema`

    Todo lo demas —las dos secciones, el filtro, tarjeta/lista, las versiones, instalar desde
    catalogo/URL/fichero y los chips de procedencia— lo pone ExtensionManagerDialog.
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
    Abre la pagina de ese login en otra pestaña, para verla sin cerrar la sesion.

    La direccion es la MISMA por la que ha entrado quien esta mirando —origen y ruta, que no siempre es la
    raiz: Kwirth se sirve tambien bajo un rootPath— mas ?loginExt=<id>, que es como el front decide pintar
    el login de una extension en vez del suyo. Es la misma forma que arma LoginExtensionPage para su
    returnTo, no una convencion nueva.
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

    // Solo en lo instalado: una pagina de login que todavia no esta instalada no se puede abrir.
    actions: (e, section): IExtensionAction[] => section === EManagerSection.INSTALLED
        ? [{
            icon: React.createElement(Launch, { fontSize: 'small' }),
            tooltip: 'Open login page in new tab',
            color: 'primary',
            onClick: () => openLoginPage((e as IInstalledLogin).id)
          }]
        : [],

    // El engranaje es de la TARJETA: solo esta vivo en los logins que declaran configuracion.
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
