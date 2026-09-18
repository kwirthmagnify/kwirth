import { IChannel, IPluvider } from '@kwirthmagnify/kwirth-common-back'
import { PLUVIDER_ID_PREFIX } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logError, logInfo } from '../tools/Logging'

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
            logInfo(ELogComponent.CORE, `  '${pluvId}' started`)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Pluvider '${pluvId}' failed to start: ${err}`)
        }
    }
}
