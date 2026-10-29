import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IChannel } from '../channels/IChannel'
import { IProvider } from '../providers/IProvider'
import { IExtensionRef } from './ConfigBundleManager'
import { PluginManager } from './PluginManager'
import { ProviderManager } from './ProviderManager'
import { SenderManager } from './SenderManager'
import { WebhookManager } from './WebhookManager'
import { AiToolsetManager } from './AiToolsetManager'
import { DceManager } from './DceManager'
import { IdpManager } from './IdpManager'
import { pluginInstallConfig, providerInstallConfig, senderConfigs, webhookConfigs, idpInstances, toolsetGrants } from './CoreManagedConfig'

/*
    Who is installed, and who gets asked for their configuration.

    This file exists so that `ConfigBundleManager` does not have to know there are eleven families with
    eleven different managers: the manager asks for a list and it is built here.

    Two rules govern what comes out of here:

      · EVERYTHING INSTALLED IS LISTED, whether it can export or not. Leaving out what cannot export would
        be the comfortable thing, and it would be lying by silence — whoever looks at the dialog has to
        see that their extension is there and why it is not going in.
      · THE CORE MANUFACTURES AN INTERLOCUTOR OF ITS OWN. What the core stores about an extension
        (`CoreManagedConfig`) goes in as `coreInstance`, and what the extension stores on its own account
        as `instance`. They are two, and they stay two all the way into the file: that is why nearly
        every extension has something to export from day one without its author doing anything, and why
        a reader of the bundle can tell which of the two parts is missing.
*/

/** The minimum needed from any extension's metadata. */
interface IMetaLike {
    id: string
    displayName?: string
    name?: string
    version?: string
    marketplaceLabel?: string
}

const nombre = (meta: IMetaLike): string => meta.displayName ?? meta.name ?? meta.id

export interface IExtensionRefSources {
    pluginManager: PluginManager
    providerManager: ProviderManager
    senderManager: SenderManager
    webhookManager: WebhookManager
    aiToolsetManager: AiToolsetManager
    dceManager: DceManager
    idpManager: IdpManager
    /*
        The LIVE channels. There is not one per installed plugin: only the required ones are
        instantiated, and never those announced as REMOTE. A plugin with no channel here still exports
        what the core stores about it; what cannot be done is asking it for its own.
    */
    channels: Map<string, IChannel>
    /** And the live providers. The same criterion. */
    providers: IProvider[]
}

export const buildExtensionRefs = async (src: IExtensionRefSources): Promise<IExtensionRef[]> => {
    const refs: IExtensionRef[] = []

    const añadir = (
        type: EExtensionType,
        meta: IMetaLike,
        coreInstance?: IExtensionRef['coreInstance'],
        instance?: IExtensionRef['instance'],
        instantiable = false
    ): void => {
        refs.push({
            type,
            id: meta.id,
            displayName: nombre(meta),
            version: meta.version,
            marketplace: meta.marketplaceLabel,
            coreInstance,
            instance,
            instantiable
        })
    }

    // Plugins: the core stores their installation configuration; the rest is their channel's, when it is alive.
    for (const meta of await src.pluginManager.listInstalled()) {
        añadir(EExtensionType.PLUGIN, meta as IMetaLike,
            pluginInstallConfig(src.pluginManager, meta.id), src.channels.get(meta.id), true)
    }

    // Providers: the same, with their instance when some channel required it.
    for (const meta of await src.providerManager.listInstalled()) {
        añadir(EExtensionType.PROVIDER, meta as IMetaLike,
            providerInstallConfig(src.providerManager, meta.id), src.providers.find(p => p.id === meta.id), true)
    }

    /*
        Senders and webhooks: their configurations are stored by the CORE — they only receive their own
        when using it — so the bulk comes from there. `getSender`/`getWebhook` instantiate when needed,
        and that is acceptable here: it is the core's normal route and their startup is light. What is
        not done is waking a channel, which opens informers and connections.
    */
    for (const meta of await src.senderManager.listInstalled()) {
        añadir(EExtensionType.SENDER, meta as IMetaLike,
            senderConfigs(src.senderManager, meta.id), src.senderManager.getSender(meta.id), true)
    }
    for (const meta of await src.webhookManager.listInstalled()) {
        añadir(EExtensionType.WEBHOOK, meta as IMetaLike,
            webhookConfigs(src.webhookManager, meta.id), src.webhookManager.getWebhook(meta.id), true)
    }

    /*
        IdP: what travels are the configured INSTANCES, and a connector can have several. The connector
        cannot enumerate them — it only receives one as a parameter when authenticating — so here the
        interlocutor is entirely the core's.
    */
    // `listConnectors` and not the index of installed ones: the index only has those that arrived through
    // a tgz, and in dev connectors are registered in memory without going through it. What counts is which
    // one is REGISTERED, which is the one that can be asked for its schema.
    for (const info of src.idpManager.listConnectors()) {
        añadir(EExtensionType.IDP, { id: info.id, displayName: info.label, version: info.version, marketplaceLabel: info.marketplaceLabel },
            idpInstances(src.idpManager, info.id))
        // No `instantiable`: a connector having no live instance takes nothing away, because its
        // instances are the core's to begin with.
    }

    // Toolsets: what travels is their grants. There is no object to ask here either: they are back end only.
    for (const meta of await src.aiToolsetManager.listInstalled()) {
        añadir(EExtensionType.AITOOLSET, meta as IMetaLike, toolsetGrants(src.aiToolsetManager, meta.id))
    }

    // DCEs: listed, with nothing to export. A DCE has no configuration in V1 (plan: plans/completed/dce/PRD.md,
    // D3); it is listed all the same, because everything installed is listed.
    for (const meta of await src.dceManager.listInstalled()) {
        añadir(EExtensionType.DCE, meta as IMetaLike)
    }

    return refs
}
