import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, IInstanceMessage, IChannelRequirements, IChannelMessageAction, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common'
import { INewsChannelConfig, NewsChannelConfig, NewsInstanceConfig } from './NewsConfig'
import { INewsData, NewsData } from './NewsData'
import { NewsSetup, NewsIcon } from './NewsSetup'
import { NewsTabContent } from './NewsTabContent'
import { IChannel, IChannelObject } from '@kwirthmagnify/kwirth-common-front'

import { INewsMessageResponse } from '../common/NewsTypes'

export class NewsChannel implements IChannel {
    private setupVisible = false
    SetupDialog = NewsSetup
    TabContent = NewsTabContent
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
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon() { return NewsIcon }

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

    onExternalConfigApply(channelObject: IChannelObject, values: any): boolean {
        if (channelObject.config) channelObject.config.maxItems = values.maxItems
        if (channelObject.instanceConfig) channelObject.instanceConfig.selectedFeeds = values.feeds?.value ?? []
        return true
    }
}
