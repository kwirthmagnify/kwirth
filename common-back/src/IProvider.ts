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
 * Persistencia que el core inyecta al provider (mismo mecanismo que reciben los canales).
 * El booleano 'secret' decide el destino: true -> Secret de Kubernetes, false -> ConfigMap.
 * Las variantes 'Common' escriben en el almacen compartido entre extensiones.
 */
export interface IProviderStorage {
    writeStorage(id: string, secret: boolean, data: any): Promise<void>
    readStorage(id: string, secret: boolean): Promise<any>
    writeStorageCommon(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon(id: string, secret: boolean): Promise<any>
}

/**
 * Un campo del payload de suscripcion, descrito para que un consumidor pueda pintar un formulario
 * en vez de exigir JSON a mano. Solo tiene sentido declararlos cuando el payload es plano; si es
 * anidado (p.ej. otel, con 'spaces'), basta con 'usage' y 'example'.
 */
export interface IProviderSubscriptionField {
    name: string
    type: 'string' | 'number' | 'boolean' | 'string[]'
    required?: boolean
    description: string
}

/**
 * Ayuda que un provider publica sobre COMO SUSCRIBIRSE a el, es decir sobre el argumento 'data' de
 * addSubscriber. No confundir con el 'schema' que un provider exporta desde su back.js, que
 * describe la configuracion del propio provider (configure/configRouter).
 *
 * La consume provider-debug para explicarle al usuario que escribir, pero cualquier canal que
 * ofrezca elegir provider puede usarla.
 */
export interface IProviderSubscriptionHelp {
    /** Como se usa, en prosa: que entrega, que hace falta para recibir algo, gotchas. */
    usage: string
    /** Payload de ejemplo, listo para pasar tal cual a addSubscriber. */
    example: Record<string, unknown>
    /** Descripcion campo a campo. Opcional: solo para payloads planos. */
    fields?: IProviderSubscriptionField[]
}

/**
 * Un campo de la configuracion del PROPIO provider (no de la suscripcion). Es el contrato comun
 * IConfigFieldDef, el mismo que usan senders, webhooks, idps y logins.
 */
export type IProviderFieldDef = IConfigFieldDef

/**
 * Lo que un provider sabe contar de si mismo.
 *
 * Existe para que kwirth pueda decir si algo esta siendo consumido o esta emitiendo para nadie, que
 * es de las pocas preguntas que NADIE puede responder desde fuera: cada provider guarda sus
 * suscriptores en su propia estructura y hasta ahora no habia forma de preguntarselo.
 *
 * ⚠️ Solo el NUMERO, no quienes son: 'IProviderSubscriber' es una interfaz de un solo metodo y no
 * lleva identidad, asi que un provider no tiene con que identificarlos. Dibujar el grafo de quien
 * consume a quien pedira ampliar ese contrato, y es una decision aparte.
 */
export interface IProviderStats {
    /** Cuantos suscriptores tiene AHORA. Cero significa que esta emitiendo para nadie. */
    subscribers: number
    /**
     * ENTREGAS hechas desde que el provider arranco: una por cada vez que se llama a
     * processProviderEvent, no una por evento producido. OPCIONAL: quien no lo lleve se muestra como
     * "no informa", igual que el resto.
     *
     * Se cuentan entregas y no eventos a proposito. Un provider que produce mil eventos y los filtra
     * todos no esta moviendo nada, y el numero util para quien opera es el trabajo que SE HACE. Ademas
     * el sitio donde incrementar es inequivoco —justo donde ya se llama al suscriptor—, y eso hace que
     * cablearlo en dieciseis providers no dependa de interpretar el codigo de cada uno.
     *
     * Es un ACUMULADO, no una tasa: quien lo lea resta dos lecturas y divide por el tiempo. El provider
     * no debe saber nada de ventanas ni de medias — eso obligaria a guardar historia en el camino
     * caliente, que es justo lo que no puede pasar.
     *
     * ⚠️ El incremento va JUNTO a la llamada al suscriptor, y es un entero. Nada
     * de timestamps por evento, nada de arrays que crezcan, nada de objetos nuevos: lo que duele en
     * Node no es el contador, es la basura que genera.
     */
    events?: number
    /** Errores al entregar, con el mismo criterio: acumulado y barato. */
    errors?: number
}

/*
    ⚠️ NO hay 'bytes'. Contarlos obligaria a medir cada evento —serializarlo o recorrerlo— y eso ya no es
    un entero: es trabajo proporcional al tamaño del dato, en el camino caliente y para todos, mire
    alguien la pantalla o no. Un provider que reciba el tamaño ya hecho (porque le llego por HTTP, por
    ejemplo) puede exponerlo por su cuenta; lo que no se hace es pedirselo a todos.
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
     * @deprecated El core deja de alimentar este metodo: un provider es dueño de su propia
     * configuracion y la sirve por 'configRouter'. Se mantiene por compatibilidad con providers
     * de terceros que aun usen la config gestionada por el core.
     */
    configure?(config: Record<string, unknown>): void
    /**
     * Ayuda de suscripcion. OPCIONAL: quien escriba un provider la añade si quiere. Sin ella el
     * consumidor sigue funcionando, simplemente no tiene nada que enseñarle al usuario sobre que
     * payload escribir.
     */
    getSubscriptionHelp?(): IProviderSubscriptionHelp
    /**
     * Nombres de las configuraciones que el provider tiene definidas (equivalente a
     * ISender.getConfigNames). OPCIONAL: solo tiene sentido en un provider que sea dueño de su
     * configuracion. El gestor de extensiones lo usa para mostrar cuantas hay en la tarjeta, igual
     * que hace con los senders. No expone valores, solo nombres.
     */
    getConfigNames?(): string[]
    /**
     * Schema de configuracion del propio provider, con el que kwirth pinta un formulario generico.
     * Es la forma ESTANDAR de declararlo, la misma que ISender.getConfigSchema e IWebhook.
     *
     * Un provider al que nadie se suscribe y que no expone router NO se instancia nunca, asi que en
     * ese caso no hay a quien preguntarselo: para esos, exporta ademas una constante 'schema' con el
     * mismo array desde el back.js, que el core lee al instalar sin instanciar nada.
     */
    getConfigSchema?(): IProviderFieldDef[]
    /**
     * Que sabe el provider de si mismo ahora mismo. OPCIONAL, como el resto de este bloque: quien no
     * lo implemente se muestra como "no informa", que es distinto de cero — un cero seria una
     * afirmacion que nadie puede sostener.
     *
     * ⚠️ Tiene que ser BARATO: devuelve lo que ya tienes, no lo calcules. Se llama cuando alguien
     * abre una pantalla de estado, pero un provider no sabe con que frecuencia, y recorrer
     * estructuras aqui convierte una consulta en trabajo para todos.
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
    startProvider(): Promise<void>
    stopProvider(): Promise<void>
    router: any
    routerAlias: string | undefined
    /**
     * El provider quiere el cuerpo de las peticiones de su router publico EN CRUDO (Buffer), sin que
     * el bodyParser global del core lo toque.
     *
     * Hace falta para todo lo que no sea JSON plano: ndjson, msgpack, protobuf, o verificar una firma
     * sobre los bytes exactos que llegaron. Sin esto, una extension que INGIERE recibe el cuerpo ya
     * parseado —y con el limite del parser global—, que es justo lo que el core resolvio para los
     * webhooks montandolos por delante.
     *
     * Por defecto es false: los providers que hoy leen 'req.body' como objeto siguen igual.
     */
    readonly rawBody?: boolean
    /**
     * Router de gestion del provider (su propia configuracion). El core lo monta SIEMPRE detras de
     * validacion de accessKey, igual que hace con los endpoints de un canal, en la ruta
     * '/core/providerconfig/<providerId>'. Es una via distinta de 'router', que es publica y puede
     * recibir trafico externo (OTLP, POSTs de terceros) y por tanto no puede exigir accessKey.
     */
    configRouter?: any
    apiKeyApi: any | undefined
}

export type TProviderConstructor = new (clusterInfo: any, kwirthData: KwirthData, storage?: IProviderStorage) => IProvider
