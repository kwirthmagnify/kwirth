import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction, ENotifyLevel } from '@kwirthmagnify/kwirth-common-front'
import { ESenderDebugAbandoned, ESenderDebugPayload, ISenderDebugMessageResponse } from '../common/SenderDebugTypes'
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
                switch (msg.payloadType) {
                    case ESenderDebugPayload.SENDERS:
                        data.senders = msg.senders ?? []
                        break
                    case ESenderDebugPayload.CONFIG:
                        // only the view of what is selected NOW: an answer for a previous choice arrives late and is dropped
                        if (msg.config && msg.config.senderId === data.form.senderId && msg.config.configName === data.form.configName) data.configView = msg.config
                        break
                    case ESenderDebugPayload.RESULT:
                        if (msg.result) {
                            /*
                                The row already exists: the send itself created it, with its request inside
                                and no response. Here it is only completed. Should it not turn up — a response
                                with no request of its own, which can only happen after a restart — it is
                                added loose, rather than losing it.
                            */
                            const entry = data.history.find(e => e.request?.id === msg.result!.id)
                            if (entry) entry.result = msg.result
                            else data.history.unshift({ result: msg.result })
                            while (data.history.length > config.maxHistory) data.history.pop()
                        }
                        break
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                const startResponse = signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START
                if (startResponse) channelObject.instanceId = signalMessage.instance

                /*
                    The core answers the start config with an IInstanceConfigResponse, which does NOT
                    carry 'level' (back/src/index.ts, sendInstanceConfigSignalMessage). This channel
                    always sends its signals WITH 'level', so they are told apart by structure and not by
                    their text, which is what breaks the moment somebody rewrites a message.
                */
                if (startResponse && signalMessage.level === undefined) {
                    data.configAccepted = true
                    return { action: EChannelRefreshAction.REFRESH }
                }

                /*
                    The back end answered a COMMAND with an error — told apart by STRUCTURE, never by its text. The
                    sends still in flight are not going to be answered (the typical case: Kwirth restarted and this
                    tab's instance is gone), so they are flagged instead of staying 'sending…' forever. A result that
                    does arrive later still completes its row.
                */
                if (signalMessage.action === EInstanceMessageAction.COMMAND && signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.level === ESignalMessageLevel.ERROR) {
                    for (const entry of data.history) {
                        if (!entry.result && !entry.abandoned) entry.abandoned = ESenderDebugAbandoned.LOST
                    }
                }

                // what the back end has to say goes through the core's notifications, not as lines inside the form
                if (signalMessage.text && signalMessage.level !== undefined && signalMessage.level !== ESignalMessageLevel.INFO) {
                    const level = signalMessage.level === ESignalMessageLevel.ERROR ? ENotifyLevel.ERROR : ENotifyLevel.WARNING
                    channelObject.notify?.(channelObject.channelId, level, signalMessage.text)
                }
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
        data.configAccepted = false
        /*
            'history' and 'form' are NOT cleared, on purpose: what was sent before and what was being
            typed are still what is being investigated, and a restart of the channel is no reason to throw
            it away. The history is cleared with its button, which is the user's decision. 'senders' is
            not cleared either: the back end sends the fresh catalogue right afterwards and overwrites it
            by itself.
        */
        data.started = true
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return false }
    continueChannel(_channelObject: IChannelObject): boolean { return false }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: ISenderDebugData = channelObject.data
        data.configAccepted = false
        // whatever was in flight is not going to answer any more: it is flagged, instead of leaving it
        // 'sending' forever and instead of making up a result nobody gave
        for (const entry of data.history) {
            if (!entry.result && !entry.abandoned) entry.abandoned = ESenderDebugAbandoned.STOPPED
        }
        data.started = false
        return true
    }

    /*
        The socket dropped: whatever was in flight will not be answered on it. Its instance is gone too (the channel
        is not reconnectable), so the core comes back with a fresh START by itself and the tab is usable again.
    */
    socketDisconnected(channelObject: IChannelObject): boolean {
        const data: ISenderDebugData = channelObject.data
        data.configAccepted = false
        for (const entry of data.history) {
            if (!entry.result && !entry.abandoned) entry.abandoned = ESenderDebugAbandoned.LOST
        }
        return true
    }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
