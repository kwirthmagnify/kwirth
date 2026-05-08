import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { INewsChannelConfig, NewsChannelConfig, NewsInstanceConfig } from './NewsConfig'
import { NewsSetup, NewsIcon } from './NewsSetup'
import { IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { INewsData, INewsItem, NewsData } from './NewsData'
import { NewsTabContent } from './NewsTabContent'

interface INewsMessageResponse {
    msgtype: 'newsmessageresponse'
    channel: 'news'
    type: EInstanceMessageType
    action: EInstanceMessageAction
    flow: EInstanceMessageFlow
    instance: string
    item?: INewsItem
}

export class NewsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = NewsSetup
    TabContent: FC<IContentProps> = NewsTabContent
    channelId = 'news'
    requirements: IChannelRequirements = {
        accessString: false,
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
        webSocket: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return NewsIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: INewsMessageResponse = JSON.parse(wsEvent.data)
        const newsData: INewsData = channelObject.data
        const newsConfig: INewsChannelConfig = channelObject.config

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.item) {
                    newsData.items.unshift(msg.item)
                    while (newsData.items.length > newsConfig.maxItems) newsData.items.pop()
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const instanceMessage: IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new NewsInstanceConfig()
        channelObject.config = new NewsChannelConfig()
        channelObject.data = new NewsData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const newsData: INewsData = channelObject.data
        newsData.items = []
        newsData.paused = false
        newsData.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const newsData: INewsData = channelObject.data
        newsData.paused = true
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const newsData: INewsData = channelObject.data
        newsData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const newsData: INewsData = channelObject.data
        newsData.paused = false
        newsData.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
