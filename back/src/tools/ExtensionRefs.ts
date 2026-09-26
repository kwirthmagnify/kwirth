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
    Quien hay instalado y a quien se le pregunta por su configuracion.

    Este fichero existe para que `ConfigBundleManager` no tenga que saber que hay once familias con once
    managers distintos: el manager pide una lista y aqui se construye.

    Dos reglas gobiernan lo que sale de aqui:

      · SE LISTA TODO LO INSTALADO, pueda exportar o no. Omitir lo que no se puede exportar seria lo
        comodo, y seria mentir por silencio — quien mira el dialogo tiene que ver que su extension esta
        ahi y por que no entra.
      · EL INTERLOCUTOR LO FABRICA EL CORE. `combine()` junta lo que el core guarda de una extension con
        lo que ella exporta de si misma, y devuelve un unico `IExtension`. Por eso casi toda extension
        tiene algo que exportar desde el primer dia, sin que su autor haga nada.
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
        Los canales VIVOS. No hay uno por plugin instalado: solo se instancian los requeridos, y nunca
        los anunciados como REMOTE. Un plugin sin canal aqui sigue exportando lo que el core guarda de
        el; lo que no se puede es preguntarle por lo suyo.
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
        Senders y webhooks: sus configuraciones las guarda el CORE —ellos solo reciben la suya al
        usarla—, asi que el grueso viene de ahi. `getSender`/`getWebhook` instancian si hace falta, y
        aqui es aceptable: es el camino normal del core y su arranque es ligero. Lo que no se hace es
        despertar un canal, que abre informers y conexiones.
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
        IdP: lo que viaja son las INSTANCIAS configuradas, y un conector puede tener varias. El conector
        no puede enumerarlas —solo recibe una como parametro al autenticar—, asi que aqui el
        interlocutor es enteramente del core.
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
