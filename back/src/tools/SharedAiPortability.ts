import { ILlm, ILlmProvider } from '@kwirthmagnify/kwirth-common-ai'

/*
    What the common AI store hands over when it travels in a configuration bundle.

    🔴 It exists because of the rule stated in `common/src/ConfigBundle.ts`: without credentials the
    secret fields travel EMPTY, never omitted — the destination needs to know they are there in order to
    ask for them to be filled in. The core was breaking that rule in both directions at once:

      · it dropped the providers ENTIRELY, so leaving credentials unticked did not only hide the keys,
        it lost the names, types, endpoints, default prices and limits that were hanging off them, and
        at the other end `writeSharedAi` never touched the secret because nothing arrived;
      · and it handed the models over raw from the configmap, so a model with a key of its own shipped
        it in clear inside a bundle whose author had deliberately left credentials unticked.

    Ticking credentials is a different matter and needs no defence here: then the keys travel, because
    that is exactly what was asked for.
*/

export interface ISharedAiStore {
    llms: ILlm[]
    providers: ILlmProvider[]
}

/** The store as it goes into a bundle: everything travels, the credentials only when they are asked for. */
export const redactSharedAi = (store: ISharedAiStore, includeCredentials: boolean): ISharedAiStore => {
    if (includeCredentials) return store
    return {
        // A key is blanked whenever there is one, without looking at `useProviderKey`: a model can keep
        // a key stored while borrowing the provider's, and a secret that is not in use is still a secret.
        llms: store.llms.map(llm => llm.key ? { ...llm, key: '' } : llm),
        providers: store.providers.map(provider => ({ ...provider, key: '' }))
    }
}
