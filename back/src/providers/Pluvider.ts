import { IChannel, IPluvider } from '@kwirthmagnify/kwirth-common-back'
import { PLUVIDER_ID_PREFIX } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logInfo, logWarning, providerLogger } from '../tools/Logging'

/*
    Un PLUVIDER es un canal que ADEMAS produce: expone in-process la informacion que ya genera, para
    que otros plugins se suscriban a ella. Sigue siendo un solo plugin, una sola clase y una sola
    instancia; lo unico que cambia es que tiene una puerta mas.

    No entra en 'clusterInfo.providers'. Ese array lo recorren los bucles que montan routers en la
    ruta publica de providers, escriben 'apiKeyApi' o marcan 'started': un canal metido ahi acabaria
    con el router de su front publicado en una ruta que no exige accessKey. Por eso vive en su propio
    registro, y la unica puerta comun es la resolucion por id de ClusterInfo.
*/
export type TPluviderChannel = IChannel & IPluvider

/*
    La declaracion es la PRESENCIA de getPluviderData(): un canal que lo implementa se ofrece como
    productor. No se detecta por 'addSubscriber', que es demasiado generico para decidir con el.
*/
export const isPluvider = (c: IChannel): c is TPluviderChannel =>
    typeof (c as Partial<IPluvider>).getPluviderData === 'function'

/*
    El id de un pluvider lo compone SIEMPRE el core a partir del id del canal, nunca lo escribe el
    autor del plugin: asi no hay forma de equivocarse con el prefijo.
*/
export const pluviderId = (channelId: string): string => PLUVIDER_ID_PREFIX + channelId

/* Si un id de suscripcion apunta a un pluvider ('plugin:agora') o a un provider ('events'). */
export const isPluviderId = (id: string): boolean => id.startsWith(PLUVIDER_ID_PREFIX)

/*
    Nombres que existen a la vez como provider y como pluvider: un provider 'agora' y un plugin 'agora'
    que ademas produce, o sea 'plugin:agora'.

    Tecnicamente NO hay ambiguedad —viven en registros distintos y cada uno se direcciona con su propio
    id, que es justo para lo que esta el prefijo— pero para una persona que lee una lista o escribe una
    suscripcion si son faciles de confundir. Por eso se avisa. Y solo se avisa: nunca se rechaza una
    instalacion por esto, entre otras cosas porque las dos extensiones pueden ser de terceros y el
    usuario no controlar ninguna de las dos.

    Se devuelve el nombre PELADO ('agora'), que es la parte que de verdad coincide.
*/
export const findNameCollisions = (pluviderIds: string[], providerIds: string[]): string[] =>
    pluviderIds
        .filter(isPluviderId)
        .map(id => id.substring(PLUVIDER_ID_PREFIX.length))
        .filter(name => providerIds.includes(name))

/*
    Avisa de cada coincidencia. 'when' dice en que momento se detecto, porque el mismo choque se reporta
    en tres: al instalar el plugin, al instalar el provider y en cada arranque del core.
*/
export const warnNameCollisions = (pluviderIds: string[], providerIds: string[], when: string): string[] => {
    const collisions = findNameCollisions(pluviderIds, providerIds)
    for (const name of collisions) {
        logWarning(ELogComponent.CORE, `Name collision (${when}): there is a provider '${name}' and a plugin '${name}' that also publishes as '${pluviderId(name)}'. Both stay usable and nothing is blocked — subscribe to '${name}' for the provider and to '${pluviderId(name)}' for the plugin — but the names are easy to mix up.`)
    }
    return collisions
}

/*
    De todo lo que los canales PIDEN en 'requirements.providers', que es lo que de verdad no esta
    disponible. No es lo mismo que recorrer lo registrado: un id pedido y no registrado no aparecia
    por ningun lado hasta que alguien intentaba suscribirse a el.

    Se devuelven por separado porque la ausencia NO significa lo mismo en cada caso. Un provider
    declarado y no registrado es una mala configuracion. Un pluvider ausente es legitimo: su plugin
    puede no estar instalado, o ser un canal SINGLE que aqui se anuncia como remoto — y el consumidor
    tiene que seguir funcionando sin el.
*/
export const findMissingSubscriptionTargets = (
    requestedIds: string[],
    registeredProviderIds: string[],
    pluviders: Map<string, TPluviderChannel>
): { missingProviders: string[], missingPluviders: string[] } => {
    const missingProviders: string[] = []
    const missingPluviders: string[] = []
    for (const id of new Set(requestedIds)) {
        if (isPluviderId(id)) {
            if (!pluviders.has(id)) missingPluviders.push(id)
        }
        else if (!registeredProviderIds.includes(id)) {
            missingProviders.push(id)
        }
    }
    return { missingProviders, missingPluviders }
}

/*
    Rehace el registro cuando la INSTANCIA de un canal se sustituye — hoy solo pasa en el hot-reload de
    un plugin de dev, pero el problema es el mismo siempre: el registro guarda la instancia, no la
    clase, asi que sustituir una sin tocar el registro deja al core hablando con un objeto que ya nadie
    usa. Sirve su descripcion, su ayuda de suscripcion y su filtro TAL Y COMO ERAN, que es justo lo que
    hace que un cambio recien recargado parezca no haber surtido efecto.

    Los suscriptores vivos se quedan en la instancia anterior y no se pueden migrar: quien estuviera
    escuchando tiene que volver a suscribirse. Por eso se avisa.
*/
export const rebindPluvider = async (pluviders: Map<string, TPluviderChannel>, pluvId: string, newInstance: IChannel): Promise<void> => {
    const old = pluviders.get(pluvId)
    if (old) {
        try { await old.stopProvider() }
        catch (err) { providerLogger(pluvId).error(`Failed to stop while being replaced: ${err}`) }
        pluviders.delete(pluvId)
    }
    if (!isPluvider(newInstance)) return
    pluviders.set(pluvId, newInstance)
    try { await newInstance.startProvider() }
    catch (err) { providerLogger(pluvId).error(`Failed to start after being replaced: ${err}`) }
    if (old) providerLogger(pluvId).warning('Replaced — its subscribers were left on the previous instance and must subscribe again')
    else providerLogger(pluvId).info('Registered')
}

/*
    Fase de arranque de los pluviders: va entre la de providers y la de canales. Un pluvider produce
    desde su lado provider, asi que cuando el primer consumidor haga startChannel() y se suscriba, la
    produccion ya esta viva.

    El orden DENTRO de esta fase no esta garantizado, y es deliberado: un pluvider que consuma de otro
    puede perderse los primeros eventos, y se asume como limitacion antes que montar un grafo de
    dependencias. Que uno falle al arrancar tampoco tumba a nadie: su canal sigue adelante y quien se
    suscriba a el simplemente no recibira, que es la dependencia blanda.
*/
export const startPluviders = async (pluviders: Map<string, TPluviderChannel>): Promise<void> => {
    if (pluviders.size === 0) return
    logInfo(ELogComponent.CORE, 'Starting pluviders:')
    for (const [pluvId, pluv] of pluviders) {
        try {
            await pluv.startProvider()
            providerLogger(pluvId).info('Started')
        }
        catch (err) {
            providerLogger(pluvId).error(`Failed to start: ${err}`)
        }
    }
}
