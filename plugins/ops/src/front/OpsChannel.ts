import React, { FC, ReactNode } from 'react'
import { Divider, Typography } from '@mui/material'
import { EChannelRefreshAction, IChannel, IChannelObject, IChannelRequirements, IContentProps, ISetupProps, ENotifyLevel } from '@kwirthmagnify/kwirth-common-front'
import { IChannelMessageAction } from '@kwirthmagnify/kwirth-common-front'
import { ISignalMessage, IInstanceConfigResponse, IInstanceConfig, EInstanceMessageFlow, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageChannel, ESignalMessageLevel, ESignalMessageEvent, EInstanceConfigObject, EInstanceConfigView, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { OpsIcon, OpsSetup } from './OpsSetup'
import { OpsTabContent } from './OpsTabContent'
import { OpsData, IOpsData, IScopedObject } from './OpsData'
import { ESwitchKey, IOpsConfig, OpsConfig, OpsInstanceConfig } from './OpsConfig'
import { EOpsCommand, IOpsMessageResponse, IOpsInstanceConfig } from './OpsTypes'
import { EOpsScope, OPS_SCOPES } from '../common/OpsTypes'

export class OpsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = OpsSetup
    TabContent: FC<IContentProps> = OpsTabContent
    channelId = 'ops'

    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
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
        webSocket: true,
        backChannels: false
    }

    getScope() { return EOpsScope.GET }
    getScopeCatalog(): IExtensionScope[] { return OPS_SCOPES }   // RBAC: scopes que declara Ops (para el editor de seguridad)
    getChannelIcon(): JSX.Element { return OpsIcon }
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let refresh: IChannelMessageAction = { action: EChannelRefreshAction.NONE }
        let opsData: IOpsData = channelObject.data

        let instanceConfigResponse: IInstanceConfigResponse = JSON.parse(wsEvent.data)
        if (instanceConfigResponse.flow === EInstanceMessageFlow.RESPONSE && instanceConfigResponse.action === EInstanceMessageAction.WEBSOCKET) {
            let newSocket = new WebSocket(channelObject.clusterUrl + '?challenge=' + (instanceConfigResponse.data as string))
            opsData.terminalManager.createTerminal(
                `${opsData.websocketRequest.namespace}/${opsData.websocketRequest.pod}/${opsData.websocketRequest.container}`,
                newSocket
            )
            refresh.action = EChannelRefreshAction.REFRESH
        } else {
            let opsMessage: IOpsMessageResponse = JSON.parse(wsEvent.data)
            switch (opsMessage.type) {
                case EInstanceMessageType.DATA:
                    if (opsMessage.flow === EInstanceMessageFlow.RESPONSE && opsMessage.command === EOpsCommand.DESCRIBE) {
                        let scopedObject = opsData.scopedObjects.find(so => so.namespace === opsMessage.namespace && so.pod === opsMessage.pod && so.container === opsMessage.container)
                        if (scopedObject) refresh.data = JSON.parse(opsMessage.data)
                        else channelObject.notify?.('ops', ENotifyLevel.INFO, 'Data received for a non-scoped object')
                        if (opsData.onDescribeResponse) opsData.onDescribeResponse({ event: 'describe', data: refresh.data })
                        refresh.action = EChannelRefreshAction.REFRESH
                    }
                    break
                case EInstanceMessageType.SIGNAL: {
                    let signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                    if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.COMMAND) {
                        channelObject.notify?.('ops', signalMessage.level as any as ENotifyLevel, signalMessage.text || 'No info')
                        refresh.action = EChannelRefreshAction.REFRESH
                    } else if (opsMessage.flow === EInstanceMessageFlow.UNSOLICITED) {
                        if (signalMessage.text) {
                            if (signalMessage.level === ESignalMessageLevel.WARNING) channelObject.notify?.('ops', ENotifyLevel.WARNING, signalMessage.text)
                            else if (signalMessage.level === ESignalMessageLevel.ERROR) channelObject.notify?.('ops', ENotifyLevel.ERROR, signalMessage.text)
                            else channelObject.notify?.('ops', ENotifyLevel.INFO, signalMessage.text)
                            refresh.action = EChannelRefreshAction.REFRESH
                        }
                        if (signalMessage.event === ESignalMessageEvent.ADD) {
                            opsData.scopedObjects.push({ namespace: signalMessage.namespace!, pod: signalMessage.pod!, container: signalMessage.container! })
                            refresh.action = EChannelRefreshAction.REFRESH
                        } else if (signalMessage.event === ESignalMessageEvent.DELETE) {
                            let i = opsData.scopedObjects.findIndex(so => so.namespace === signalMessage.namespace && so.pod === signalMessage.pod && (!signalMessage.container || so.container === signalMessage.container))
                            while (i >= 0) {
                                opsData.scopedObjects.splice(i, 1)
                                i = opsData.scopedObjects.findIndex(so => so.namespace === signalMessage.namespace && so.pod === signalMessage.pod && (!signalMessage.container || so.container === signalMessage.container))
                            }
                            refresh.action = EChannelRefreshAction.REFRESH
                        }
                    } else {
                        if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                            channelObject.instanceId = signalMessage.instance
                            if (signalMessage.text) { refresh.action = EChannelRefreshAction.REFRESH; channelObject.notify?.('ops', ENotifyLevel.INFO, signalMessage.text) }
                        }
                    }
                    break
                }
                default:
                    console.log(`[ops] Invalid message type ${opsMessage.type}`)
            }
        }
        return refresh
    }

    waitForInstanceAndStart = async (channelObject: IChannelObject, shell: IScopedObject): Promise<void> => {
        if (!channelObject.webSocket) return
        let opsData: IOpsData = channelObject.data
        while (channelObject.instanceId === '') await new Promise(r => setTimeout(r, 10))
        let instanceConfig: IInstanceConfig = {
            flow: EInstanceMessageFlow.REQUEST, action: EInstanceMessageAction.WEBSOCKET,
            channel: EInstanceMessageChannel.OPS, type: EInstanceMessageType.DATA,
            accessKey: channelObject.accessString!, instance: channelObject.instanceId,
            namespace: shell.namespace, group: '', pod: shell.pod, container: shell.container,
            objects: EInstanceConfigObject.PODS, scope: '', view: EInstanceConfigView.CONTAINER,
            data: opsData.startCommand
        }
        opsData.websocketRequest = { namespace: shell.namespace, pod: shell.pod, container: shell.container }
        channelObject.webSocket.send(JSON.stringify(instanceConfig))
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.config = new OpsConfig()
        channelObject.data = new OpsData()
        channelObject.instanceConfig = new OpsInstanceConfig()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        let opsData: IOpsData = channelObject.data
        let opsConfig: IOpsConfig = channelObject.config
        opsData.scopedObjects = []
        opsData.selectedTerminal = undefined
        opsData.paused = false
        opsData.started = true
        if (opsConfig.launchShell && opsConfig.shell) this.waitForInstanceAndStart(channelObject, opsConfig.shell)
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean { (channelObject.data as IOpsData).paused = true; return false }
    continueChannel(channelObject: IChannelObject): boolean { (channelObject.data as IOpsData).paused = false; return true }
    stopChannel(channelObject: IChannelObject): boolean { const d = channelObject.data as IOpsData; d.paused = false; d.started = false; return false }
    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }

    // Called by ContentExternal (magnify) for the embedded terminal mode
    prepareExternalChannel(view: EInstanceConfigView, selectedResources: any[], container: string): { data: any; config: any; instanceConfig: any; formConfig: any } {
        const namespace = selectedResources[0]?.data?.origin?.metadata?.namespace || ''
        const pod = selectedResources[0]?.data?.origin?.metadata?.name || ''
        const data = new OpsData()
        const config: IOpsConfig = {
            accessKey: ESwitchKey.DISABLED,
            launchShell: true,
            shell: { namespace, pod, container }
        }
        const instanceConfig: IOpsInstanceConfig = { sessionKeepAlive: false }
        return { data, config, instanceConfig, formConfig: {} }
    }

    getExternalHelpContent(): ReactNode {
        return React.createElement(React.Fragment, null,
            React.createElement(Typography, { variant: 'subtitle1', sx: { fontWeight: 700, flexGrow: 1 } }, 'Ops'),
            React.createElement(Divider),
            React.createElement(Typography, { fontSize: 12 }, 'You can use clipboard functions by pressing Ctrl+Shift+C for copying and Ctrl+Shift+V for pasting'),
            React.createElement(Typography, { fontSize: 12 }, 'You can minimize this window and the connection will keep open, or you can close this window and the connection to the container will be closed.')
        )
    }
}
