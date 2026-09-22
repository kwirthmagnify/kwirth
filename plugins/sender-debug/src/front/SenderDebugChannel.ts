import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { ESenderDebugPayload, ISenderDebugMessageResponse } from '../common/SenderDebugTypes'
import { ISenderDebugConfig, SenderDebugConfig, SenderDebugInstanceConfig } from './SenderDebugConfig'
import { ISenderDebugData, SenderDebugData } from './SenderDebugData'
import { SenderDebugSetup, SenderDebugIcon } from './SenderDebugSetup'
import { SenderDebugTabContent } from './SenderDebugTabContent'
import { FC } from 'react'

export class SenderDebugChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = SenderDebugSetup
    TabContent: FC<IContentProps> = SenderDebugTabContent
    channelId = 'sender-debug'
    requirements: IChannelRequirements = {
        accessString: true,     // cada COMMAND viaja con su accessKey, o el core lo descarta
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,        // la pestaña manda los comandos por el websocket de la instancia
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return SenderDebugIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: ISenderDebugMessageResponse = JSON.parse(wsEvent.data)
        const data: ISenderDebugData = channelObject.data
        const config: ISenderDebugConfig = channelObject.config

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.payloadType === ESenderDebugPayload.SENDERS) {
                    data.senders = msg.senders ?? []
                }
                else {
                    if (msg.result) {
                        /*
                            La fila ya existe: la creo el propio envio, con su peticion dentro y sin
                            respuesta. Aqui solo se completa. Si no apareciese —una respuesta sin su
                            peticion, que solo puede pasar tras un rearranque— se añade suelta, antes
                            que perderla.
                        */
                        const entry = data.history.find(e => e.request?.id === msg.result!.id)
                        if (entry) entry.result = msg.result
                        else data.history.unshift({ result: msg.result })
                        while (data.history.length > config.maxHistory) data.history.pop()
                    }
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                const startResponse = signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START
                if (startResponse) channelObject.instanceId = signalMessage.instance

                /*
                    El core responde al start config con un IInstanceConfigResponse, que NO lleva
                    'level' (back/src/index.ts, sendInstanceConfigSignalMessage). Este canal siempre
                    manda sus señales CON 'level', asi que se distinguen por estructura y no por su
                    literal, que es lo que se rompe en cuanto alguien reescribe un texto.
                */
                if (startResponse && signalMessage.level === undefined) {
                    data.configAccepted = true
                    return { action: EChannelRefreshAction.REFRESH }
                }

                if (signalMessage.text && signalMessage.level !== ESignalMessageLevel.INFO) data.signals.push(signalMessage.text)
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new SenderDebugInstanceConfig()
        channelObject.config = new SenderDebugConfig()
        channelObject.data = new SenderDebugData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: ISenderDebugData = channelObject.data
        data.signals = []
        data.configAccepted = false
        /*
            'history' y 'form' NO se limpian a proposito: lo que se envio antes y lo que se estaba
            escribiendo siguen siendo lo que se esta investigando, y un rearranque del canal no es
            motivo para tirarlo. El historial se limpia con su boton, que es una decision del usuario.
            'senders' tampoco: el back manda el catalogo fresco justo despues y lo sobreescribe solo.
        */
        data.started = true
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return false }
    continueChannel(_channelObject: IChannelObject): boolean { return false }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: ISenderDebugData = channelObject.data
        data.configAccepted = false
        // lo que estuviera en vuelo ya no va a contestar: se marca, en vez de dejarlo 'enviando' para
        // siempre y en vez de inventarle un resultado que nadie ha dado
        for (const entry of data.history) {
            if (!entry.result) entry.abandoned = true
        }
        data.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
