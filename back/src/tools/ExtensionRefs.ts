import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IChannel } from '../channels/IChannel'
import { IProvider } from '../providers/IProvider'
import { IExtensionRef } from './ConfigBundleManager'
import { PluginManager } from './PluginManager'
import { ProviderManager } from './ProviderManager'
import { SenderManager } from './SenderManager'
import { WebhookManager } from './WebhookManager'
import { AiToolsetManager } from './AiToolsetManager'
import { IdpManager } from './IdpManager'
import { combine, pluginInstallConfig, providerInstallConfig, senderConfigs, webhookConfigs, idpInstances, toolsetGrants } from './CoreManagedConfig'

/*
    Who is installed, and who gets asked for their configuration.

    This file exists so that `ConfigBundleManager` does not have to know there are eleven families with
    eleven different managers: the manager asks for a list and it is built here.

    Two rules govern what comes out of here:

      · EVERYTHING INSTALLED IS LISTED, whether it can export or not. Leaving out what cannot export would
        be the comfortable thing, and it would be lying by silence — whoever looks at the dialog has to
        see that their extension is there and why it is not going in.
      · THE CORE MANUFACTURES THE INTERLOCUTOR. `combine()` joins what the core stores about an extension
        with what the extension exports of itself, and returns a single `IExtension`. That is why nearly
        every extension has something to export from day one, without its author doing anything.
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

    const añadir = (type: EExtensionType, meta: IMetaLike, instance?: IExtensionRef['instance']): void => {
        refs.push({
            type,
            id: meta.id,
            displayName: nombre(meta),
            version: meta.version,
            marketplace: meta.marketplaceLabel,
            instance
        })
    }

    // Plugins: the core stores their installation configuration; the rest is their channel's, when it is alive.
    for (const meta of await src.pluginManager.listInstalled()) {
        añadir(EExtensionType.PLUGIN, meta as IMetaLike,
            combine(pluginInstallConfig(src.pluginManager, meta.id), src.channels.get(meta.id)))
    }

    // Providers: the same, with their instance when some channel required it.
    for (const meta of await src.providerManager.listInstalled()) {
        añadir(EExtensionType.PROVIDER, meta as IMetaLike,
            combine(providerInstallConfig(src.providerManager, meta.id), src.providers.find(p => p.id === meta.id)))
    }

    /*
        Senders and webhooks: their configurations are stored by the CORE — they only receive their own
        when using it — so the bulk comes from there. `getSender`/`getWebhook` instantiate when needed,
        and that is acceptable here: it is the core's normal route and their startup is light. What is
        not done is waking a channel, which opens informers and connections.
    */
    for (const meta of await src.senderManager.listInstalled()) {
        añadir(EExtensionType.SENDER, meta as IMetaLike,
            combine(senderConfigs(src.senderManager, meta.id), src.senderManager.getSender(meta.id)))
    }
    for (const meta of await src.webhookManager.listInstalled()) {
        añadir(EExtensionType.WEBHOOK, meta as IMetaLike,
            combine(webhookConfigs(src.webhookManager, meta.id), src.webhookManager.getWebhook(meta.id)))
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
    }

    // Toolsets: what travels is their grants. There is no object to ask here either: they are back end only.
    for (const meta of await src.aiToolsetManager.listInstalled()) {
        añadir(EExtensionType.AITOOLSET, meta as IMetaLike, toolsetGrants(src.aiToolsetManager, meta.id))
    }

    return refs
}
