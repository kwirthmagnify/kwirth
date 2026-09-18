import { IProviderSubscriber, IProviderSubscriptionHelp } from './IProvider'

/**
 * Lo que el gestor de extensiones y provider-debug enseñan de un pluvider. El consumidor de un
 * pluvider es OTRO EQUIPO, asi que hace falta algo que mostrar sin leerse el codigo.
 */
export interface IPluviderData {
    /** Que produce, en una linea. */
    description: string
    /** Nombre del tipo del evento que emite (p.ej. 'IAgoraAlert'), para orientar al consumidor. */
    eventTypeName?: string
}

/**
 * Un plugin que ADEMAS produce: expone in-process la informacion que ya genera, para que otros
 * plugins se suscriban a ella. No es una segunda extension empaquetada dentro del plugin: lo
 * implementa la MISMA clase del canal, sobre la misma instancia y los mismos datos.
 *
 * NO extiende IProvider a proposito. Un pluvider no pasa por la maquinaria de providers —no se mete
 * en 'clusterInfo.providers', que es lo que recorren los bucles que montan routers, escriben
 * 'apiKeyApi' o marcan 'started'—, asi que no tiene 'id', 'router', 'routerAlias', 'providesRouter',
 * 'requiresApiKeyApi' ni 'apiKeyApi'.
 *
 * El id tampoco lo escribe el autor: lo compone el core como '<PLUVIDER_ID_PREFIX><channelId>', para
 * que nadie se equivoque con el prefijo.
 *
 * 'TSub' es la forma del filtro de suscripcion. Como en los providers, cada pluvider decide si
 * filtra y con que forma; si no filtra, se deja el generico sin especificar.
 *
 * Ejemplo:
 *
 *   class AgoraChannel implements IChannel, IPluvider<IAgoraAlertSubscription> { … }
 */
export interface IPluvider<TSub = unknown> {
    /**
     * Metadatos del pluvider. Su PRESENCIA es la declaracion: un canal que implementa este metodo se
     * ofrece como productor, y el core lo registra. No hay flags ni deteccion por duck-typing.
     */
    getPluviderData(): IPluviderData

    addSubscriber(c: IProviderSubscriber, data: TSub): Promise<void>
    removeSubscriber(c: IProviderSubscriber): Promise<void>
    updateSubscription?(c: IProviderSubscriber, data: TSub): Promise<void>

    /**
     * Arranca la produccion. El core lo llama en la fase de pluviders, es decir ANTES de
     * 'startChannel()': el trabajo de fondo vive en este lado y el front se engancha despues.
     */
    startProvider(): Promise<void>
    stopProvider(): Promise<void>

    /**
     * Obligatorio, a diferencia del homonimo de IProvider, que es opcional. Un provider suele
     * consumirlo quien lo escribio; un pluvider lo consume gente de fuera, y sin esto no tiene como
     * saber que escribir en la suscripcion ni que va a recibir.
     */
    getSubscriptionHelp(): IProviderSubscriptionHelp
}
