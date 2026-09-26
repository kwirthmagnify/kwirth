import { KwirthData, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { IExtension, IExtensionLogger } from './IExtension'

/**
 * Minimal interface representing the channel side that providers interact with.
 * Providers only need to call processProviderEvent on their subscribers.
 */
export interface IProviderSubscriber {
    processProviderEvent(providerId: string, obj: any): void
}

/**
 * How a consumer subscribes to a producer. The core hands one of these out already bound to the two
 * ends — the producer and whoever asked for it — with 'clusterInfo.getProvider(id, this)'.
 *
 * The consumer is usually a channel, but it does NOT have to be: a PROVIDER may consume another
 * provider, which is how a provider that owns shared configuration — cloud credentials, say — reaches
 * the providers that need it. A provider subscribes from onProvidersReady(), never from
 * startProvider(); see that method for why.
 *
 * It exists because a channel used to receive the provider OBJECT and call 'addSubscriber' on it,
 * which meant the core could be bypassed without doing anything wrong, and therefore that its
 * registry of who consumes what — the one the status graph is drawn from — was incomplete by
 * construction. Going through the handle is what makes that registry true.
 *
 * ⚠️ The handle is NOT in the path of the data. It hands the provider the very same subscriber it
 * was given, so events still travel straight from the producer to the consumer: no wrapper, no extra
 * call, nothing per event. What runs is two functions per SUBSCRIPTION, which happens once when a tab
 * opens. That is the whole reason it is shaped like this.
 *
 * One subscription per handle call, so a channel serving several instances subscribes once per
 * instance with its own subscriber, and each one is unsubscribed on its own. The edge in the graph
 * survives until the last of them is gone.
 */
export interface IProviderHandle {
    /** Who produces: a provider ('events') or a pluvider ('plugin:agora'). */
    readonly id: string
    /**
     * Returns whatever the producer returned — normally a promise. It is handed back instead of
     * swallowed because a provider that fails while taking a subscriber on board leaves an unhandled
     * rejection, and that takes the whole core down. A consumer that wants to survive third-party
     * providers wraps this in Promise.resolve().catch(); one that does not care ignores it.
     */
    subscribe(subscriber: IProviderSubscriber, data?: any): unknown
    /** Changes what this subscriber wants. Providers may not implement it; then nothing happens. */
    updateSubscription(subscriber: IProviderSubscriber, data?: any): unknown
    unsubscribe(subscriber: IProviderSubscriber): unknown
}

/**
 * Persistence the core injects into the provider (the same mechanism channels receive).
 * The 'secret' boolean decides the destination: true -> Kubernetes Secret, false -> ConfigMap.
 * The 'Common' variants write to the store shared between extensions.
 */
export interface IProviderStorage {
    writeStorage(id: string, secret: boolean, data: any): Promise<void>
    readStorage(id: string, secret: boolean): Promise<any>
    writeStorageCommon(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon(id: string, secret: boolean): Promise<any>
}

/**
 * A field of the subscription payload, described so a consumer can draw a form instead of demanding
 * hand-written JSON. Declaring them only makes sense when the payload is flat; when it is nested
 * (otel, for instance, with 'spaces'), 'usage' and 'example' are enough.
 */
export interface IProviderSubscriptionField {
    name: string
    type: 'string' | 'number' | 'boolean' | 'string[]'
    required?: boolean
    description: string
}

/**
 * Help a provider publishes about HOW TO SUBSCRIBE to it, that is, about the 'data' argument of
 * addSubscriber. Not to be confused with the 'schema' a provider exports from its back.js, which
 * describes the provider's own configuration (configure/configRouter).
 *
 * provider-debug consumes it to explain to the user what to write, but any channel that offers a
 * choice of provider can use it.
 */
export interface IProviderSubscriptionHelp {
    /** How it is used, in prose: what it delivers, what it takes to receive anything, gotchas. */
    usage: string
    /** Example payload, ready to pass to addSubscriber as it is. */
    example: Record<string, unknown>
    /** Field-by-field description. Optional: only for flat payloads. */
    fields?: IProviderSubscriptionField[]
}

/**
 * A field of the provider's OWN configuration (not of the subscription). It is the common contract
 * IConfigFieldDef, the same one senders, webhooks, idps and logins use.
 */
export type IProviderFieldDef = IConfigFieldDef

/**
 * What a provider needs from the rest of the core. Same shape as the 'providers' list of a channel's
 * requirements, so both read alike; see IProvider.requirements.
 */
export interface IProviderRequirements {
    /** Ids of the providers this one consumes (never a pluvider 'plugin:<name>' id). */
    providers: string[]
}

/**
 * What a provider can tell about itself.
 *
 * It exists so kwirth can say whether something is being consumed or emitting to nobody, which is one
 * of the few questions NOBODY can answer from the outside: each provider keeps its subscribers in its
 * own structure, and until now there was no way to ask it.
 *
 * ⚠️ Only the NUMBER, not who they are: 'IProviderSubscriber' is a single-method interface and carries
 * no identity, so a provider has nothing to identify them with. Drawing the graph of who consumes whom
 * will require widening that contract, and that is a separate decision.
 */
export interface IProviderStats {
    /** How many subscribers it has RIGHT NOW. Zero means it is emitting to nobody. */
    subscribers: number
    /**
     * DELIVERIES made since the provider started: one per call to processProviderEvent, not one per
     * event produced. OPTIONAL: whoever does not keep it is shown as "not reported", like the rest.
     *
     * Deliveries are counted instead of events on purpose. A provider that produces a thousand events
     * and filters them all out is moving nothing, and the number that is useful to whoever operates is
     * the work that ACTUALLY HAPPENS. Besides, the place to increment is unambiguous — right where the
     * subscriber is already called — and that means wiring it in sixteen providers does not depend on
     * interpreting each one's code.
     *
     * It is a RUNNING TOTAL, not a rate: whoever reads it subtracts two readings and divides by time.
     * The provider must know nothing about windows or averages — that would force keeping history in
     * the hot path, which is exactly what must not happen.
     *
     * ⚠️ The increment goes RIGHT NEXT to the subscriber call, and it is an integer. No per-event
     * timestamps, no growing arrays, no new objects: what hurts in Node is not the counter, it is the
     * garbage it generates.
     */
    events?: number
    /** Delivery errors, under the same criterion: a running total, and cheap. */
    errors?: number
}

/*
    ⚠️ There is NO 'bytes'. Counting them would mean measuring every event — serialising it or walking
    it — and that is no longer an integer: it is work proportional to the size of the data, in the hot
    path and for everyone, whether anyone is looking at the screen or not. A provider that receives the
    size already computed (because it arrived over HTTP, say) can expose it on its own; what is not done
    is demanding it from everybody.
*/

/**
 * Interface that all provider plugins must implement.
 * Use 'any' for clusterInfo to avoid pulling in kubernetes/docker dependencies.
 */
export interface IProvider extends IExtension {
    readonly id: string
    readonly providesRouter: boolean
    readonly requiresApiKeyApi: boolean
    addSubscriber(c: IProviderSubscriber, data: any): Promise<void>
    removeSubscriber(c: IProviderSubscriber): Promise<void>
    updateSubscription?(c: IProviderSubscriber, data: any): Promise<void>
    /**
     * @deprecated The core no longer feeds this method: a provider owns its own configuration and
     * serves it through 'configRouter'. It is kept for compatibility with third-party providers that
     * still use the core-managed config.
     */
    configure?(config: Record<string, unknown>): void
    /**
     * Subscription help. OPTIONAL: whoever writes a provider adds it if they want to. Without it the
     * consumer keeps working, it simply has nothing to show the user about which payload to write.
     */
    getSubscriptionHelp?(): IProviderSubscriptionHelp
    /**
     * Names of the configurations the provider has defined (the equivalent of
     * ISender.getConfigNames). OPTIONAL: it only makes sense on a provider that owns its
     * configuration. The extension manager uses it to show how many there are on the card, just as it
     * does with senders. It exposes no values, only names.
     */
    getConfigNames?(): string[]
    /**
     * Configuration schema of the provider itself, which kwirth uses to draw a generic form.
     * This is the STANDARD way to declare it, the same as ISender.getConfigSchema and IWebhook.
     *
     * A provider nobody subscribes to and that exposes no router is NEVER instantiated, so in that
     * case there is nobody to ask: for those, also export a 'schema' constant with the same array from
     * the back.js, which the core reads at install time without instantiating anything.
     */
    getConfigSchema?(): IProviderFieldDef[]
    /**
     * What the provider knows about itself right now. OPTIONAL, like the rest of this block: whoever
     * does not implement it is shown as "not reported", which is different from zero — a zero would be
     * a claim nobody can back up.
     *
     * ⚠️ It has to be CHEAP: return what you already have, do not compute it. It is called when
     * somebody opens a status screen, but a provider does not know how often, and walking structures
     * here turns a query into work for everyone.
     */
    getStats?(): IProviderStats
    /**
     * The core hands the provider a logger that already knows who it is, right after building it.
     *
     * OPTIONAL, like everything in this block: a provider that does not implement it keeps writing
     * wherever it was writing, and an older core that never calls it leaves the provider on its own
     * fallback. Neither side needs the other to be up to date.
     *
     * Why it exists: channels get a 'backChannelObject' to log with, providers got nothing, so the
     * only thing left to them was 'console.log'. That comes out with no timestamp, no level and no
     * component — an error from a provider looks exactly like an informational line, and nothing can
     * be filtered. With this, a provider's line reads '[prov] [ERRO] [longhorn] ...' and the
     * provider does not even have to write its own id: the core puts it there.
     */
    setLogger?(logger: IExtensionLogger): void
    /**
     * Called once, after EVERY provider and pluvider is registered and started. This is where a
     * provider that CONSUMES another one subscribes to it.
     *
     * ⚠️ Do not subscribe from startProvider(). Whether the producer is registered by then depends on
     * which startup loop instantiated it and on the order within that loop, so it would work or not
     * for reasons you cannot see from your own code.
     *
     * 🔴 Whatever you subscribe to here, unsubscribe in stopProvider(). Skipping it does not leak one
     * object: the producer keeps feeding an instance nobody uses any more, and every hot reload
     * leaves another ghost behind holding whatever that instance held.
     *
     * OPTIONAL, like the rest of this block: a provider that does not implement it is never called,
     * and an older core that does not know about it simply never calls anyone.
     */
    onProvidersReady?(): void | Promise<void>
    /**
     * The providers this provider CONSUMES. The core instantiates them even if no channel asks for
     * them, the same way it instantiates the ones a channel lists in its own requirements.
     *
     * Without it, a producer nobody else asks for and that exposes no router is never instantiated,
     * and getProvider() hands the consumer 'undefined' in onProvidersReady(). The dependency stays
     * SOFT: one that is not installed is a warning, and the consumer must survive its absence.
     *
     * Pluvider ids ('plugin:<name>') are not listed here: a pluvider exists when its plugin is
     * installed, the core cannot create it.
     *
     * OPTIONAL: a provider that consumes nothing leaves it out, and an older core ignores it.
     */
    requirements?: IProviderRequirements
    startProvider(): Promise<void>
    stopProvider(): Promise<void>
    router: any
    routerAlias: string | undefined
    /**
     * The provider wants the body of the requests to its public router RAW (a Buffer), untouched by
     * the core's global bodyParser.
     *
     * Needed for anything that is not plain JSON: ndjson, msgpack, protobuf, or verifying a signature
     * over the exact bytes that arrived. Without this, an extension that INGESTS receives the body
     * already parsed — and with the global parser's limit — which is exactly what the core solved for
     * webhooks by mounting them in front.
     *
     * It defaults to false: providers that read 'req.body' as an object today are unaffected.
     */
    readonly rawBody?: boolean
    /**
     * The provider's management router (its own configuration). The core ALWAYS mounts it behind
     * accessKey validation, just as it does with a channel's endpoints, at the route
     * '/core/providerconfig/<providerId>'. It is a separate path from 'router', which is public and may
     * receive external traffic (OTLP, third-party POSTs) and therefore cannot demand an accessKey.
     */
    configRouter?: any
    apiKeyApi: any | undefined
}

export type TProviderConstructor = new (clusterInfo: any, kwirthData: KwirthData, storage?: IProviderStorage) => IProvider
