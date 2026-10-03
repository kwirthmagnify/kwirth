import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ENotifyLevel, ESignalMessageLevel, IInstanceMessage, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { FC } from 'react'
import { WebampConfig, WebampInstanceConfig, IWebampConfig } from './WebampConfig'
import { WebampData, IWebampData } from './WebampData'
import { WebampSetup, WebampIcon } from './WebampSetup'
import { WebampTabContent } from './WebampTabContent'
import { WebampMachine } from './WebampMachine'

/**
 * Webamp channel.
 *
 * The IChannel contract already brings start/pause/continue/stop, which is
 * exactly the lifecycle a music player needs. Here we just translate:
 * start creates the player, pause and continue are no-ops (Webamp manages its
 * own playback), stop discards it.
 *
 * The player runs entirely in the browser (iframe); the back exists only to
 * fulfil the channel contract.
 */
export class WebampChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = WebampSetup
    TabContent: FC<IContentProps> = WebampTabContent
    channelId = 'webamp'
    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: false,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return WebampIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IInstanceMessage = JSON.parse(wsEvent.data)

        // The core rejects things by sending a SIGNAL of ERROR level.
        const signal = msg as ISignalMessage
        if (msg.type === EInstanceMessageType.SIGNAL && signal.level === ESignalMessageLevel.ERROR) {
            channelObject.notify?.(channelObject.channelId, ENotifyLevel.ERROR,
                signal.text || 'The channel reported an error')
            return { action: EChannelRefreshAction.NONE }
        }

        if (msg.type === EInstanceMessageType.SIGNAL
            && msg.flow === EInstanceMessageFlow.RESPONSE
            && msg.action === EInstanceMessageAction.START) {
            if (!msg.instance) {
                channelObject.notify?.(channelObject.channelId, ENotifyLevel.ERROR,
                    'The channel did not start: the server returned no instance.')
                return { action: EChannelRefreshAction.NONE }
            }
            channelObject.instanceId = msg.instance
            return { action: EChannelRefreshAction.REFRESH }
        }

        return { action: EChannelRefreshAction.NONE }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new WebampInstanceConfig()
        channelObject.config = new WebampConfig()
        const webampData: IWebampData = channelObject.data = new WebampData()
        void webampData
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const webampData: IWebampData = channelObject.data
        const instanceConfig = channelObject.instanceConfig as WebampInstanceConfig | undefined

        // Create the music player (iframe). It lives in channelObject.data
        // to survive tab switches.
        if (!webampData.machine) {
            webampData.machine = new WebampMachine()
            webampData.machine.init(instanceConfig?.m3uUrl)
        }

        webampData.started = true
        webampData.paused = false
        webampData.revision++
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const webampData: IWebampData = channelObject.data
        webampData.paused = true
        webampData.revision++
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const webampData: IWebampData = channelObject.data
        webampData.paused = false
        webampData.revision++
        return true
    }

    /**
     * Stop discards the player. Switching tabs does NOT call here, which is
     * exactly what allows the state to survive unmounting.
     */
    stopChannel(channelObject: IChannelObject): boolean {
        const webampData: IWebampData = channelObject.data
        const webampConfig: IWebampConfig = channelObject.config
        void webampConfig
        webampData.machine?.dispose()
        webampData.machine = undefined
        webampData.started = false
        webampData.paused = false
        webampData.revision++
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
