import {
    EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, IInstanceMessage
} from '@kwirthmagnify/kwirth-common'
import {
    IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps,
    EChannelRefreshAction
} from '@kwirthmagnify/kwirth-common-front'
import { FC } from 'react'
import { SugarlessConfig, SugarlessInstanceConfig } from './SugarlessConfig'
import { applyEvent, ESugarlessStatus, ISugarlessData, SugarlessData } from './SugarlessData'
import { SugarlessIcon } from './SugarlessIcon'
import { SugarlessSetup } from './SugarlessSetup'
import { SugarlessTabContent } from './SugarlessTabContent'
import { ISugarlessMessageResponse } from '../common/SugarlessTypes'

export class SugarlessChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = SugarlessSetup
    TabContent: FC<IContentProps> = SugarlessTabContent
    channelId = 'sugarless'
    requirements: IChannelRequirements = {
        accessString: false,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: false,
        notifications: false,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: false,
        backChannels: false
    }

    /*
        Scope 'none': este canal no mira nada del cluster, asi que no tiene por que exigir ambito de
        cluster para abrirse. Va de la mano de declararse autonomo en el back (cluster:false y
        resourced:false), que es lo que hace que se arranque con la view 'none'.
    */
    getScope() { return EInstanceConfigScope.NONE }

    getChannelIcon(): JSX.Element { return SugarlessIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const message = JSON.parse(wsEvent.data) as IInstanceMessage
        const data: ISugarlessData = channelObject.data

        switch (message.type) {
            case EInstanceMessageType.DATA: {
                const changed = applyEvent(data, (message as ISugarlessMessageResponse).event)
                return { action: changed ? EChannelRefreshAction.REFRESH : EChannelRefreshAction.NONE }
            }
            case EInstanceMessageType.SIGNAL: {
                if (message.flow === EInstanceMessageFlow.RESPONSE && message.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = message.instance
                }
                /*
                    Una señal de error aqui es del CANAL (por ejemplo, el provider no esta corriendo),
                    no de la lectura de glucosa. Se muestra igual, porque para el usuario el sintoma es
                    el mismo: no hay grafica y quiere saber por que.
                */
                const text = (message as IInstanceMessage & { text?: string }).text
                if (text) {
                    data.status = ESugarlessStatus.ERROR
                    data.statusMessage = text
                    return { action: EChannelRefreshAction.REFRESH }
                }
                return { action: EChannelRefreshAction.NONE }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new SugarlessInstanceConfig()
        channelObject.config = new SugarlessConfig()
        channelObject.data = new SugarlessData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: ISugarlessData = channelObject.data
        data.samples = []
        data.status = ESugarlessStatus.WAITING
        data.statusMessage = ''
        data.paused = false
        data.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        (channelObject.data as ISugarlessData).paused = true
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        (channelObject.data as ISugarlessData).paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: ISugarlessData = channelObject.data
        data.paused = false
        data.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
