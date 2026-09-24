import React, { FC } from 'react'
import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { StatusIcon } from './icons'
import { EStatusPayload, IStatusMessageResponse } from '../common/StatusTypes'
import { IStatusData, StatusData } from './StatusData'
import { StatusTabContent } from './StatusTabContent'

/*
    No hay diálogo de configuración: este canal no tiene nada que configurar — se abre y enseña el
    inventario. Se declara igualmente porque el contrato lo pide, y dice lo que hay en vez de abrir un
    diálogo vacío.
*/
const StatusSetup: FC<ISetupProps> = () => React.createElement('div', null, 'Kwirth Status has nothing to configure: open it and it shows what this Kwirth has inside.')

export class StatusChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = StatusSetup
    TabContent: FC<IContentProps> = StatusTabContent
    channelId = 'status'
    requirements: IChannelRequirements = {
        accessString: true,     // los comandos viajan con su accessKey o el core los descarta
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,           // no hay nada que preguntar antes de arrancar
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,        // el refresco se pide por el socket de la instancia
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return React.createElement(StatusIcon) }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IStatusMessageResponse = JSON.parse(wsEvent.data)
        const data: IStatusData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.payloadType === EStatusPayload.INVENTORY && msg.inventory) {
                    // Se REEMPLAZA, no se acumula: lo que se enseña es la última foto (ver StatusData).
                    data.inventory = msg.inventory
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signalMessage.instance
                    data.configAccepted = true
                    data.started = true
                }
                if (signalMessage.level === ESignalMessageLevel.ERROR) data.signals.push(signalMessage.text ?? 'Unknown error')
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        // Sin esto, TabContent pinta sobre un 'data' que no existe: el core no lo crea por su cuenta.
        channelObject.data = new StatusData()
        return true
    }
    startChannel(_channelObject: IChannelObject): boolean { return true }
    stopChannel(_channelObject: IChannelObject): boolean { return true }
    pauseChannel(_channelObject: IChannelObject): boolean { return true }
    continueChannel(_channelObject: IChannelObject): boolean { return true }
    socketDisconnected(_channelObject: IChannelObject): boolean { return true }
    /*
        false = el core rehace la instancia al reconectar, en vez de dar por buena la anterior. Es lo que
        queremos: tras una reconexion la foto que hubiera en pantalla puede ser vieja, y se pide otra.
    */
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
