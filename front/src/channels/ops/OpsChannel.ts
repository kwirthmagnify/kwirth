import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { IOpsMessageResponse, EOpsCommand, ISignalMessage, IInstanceConfigResponse, IInstanceConfig, EInstanceMessageFlow, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageChannel, ESignalMessageLevel, ESignalMessageEvent, EInstanceConfigObject, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { OpsIcon, OpsSetup } from './OpsSetup'
import { OpsTabContent } from './OpsTabContent'
import { OpsData, IOpsData, IXTerm, IScopedObject } from './OpsData'
import { OpsInstanceConfig, OpsConfig, IOpsConfig } from './OpsConfig'
// @ts-ignore
import 'xterm/css/xterm.css'
import { ENotifyLevel } from '../../tools/Global'

export class OpsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = OpsSetup
    TabContent: FC<IContentProps> = OpsTabContent
    channelId = 'ops'
    
    requirements:IChannelRequirements = {
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
        webSocket: true
    }

    getScope() { return 'ops$get' }
    getChannelIcon(): JSX.Element { return OpsIcon }
    
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let refresh:IChannelMessageAction = {
            action : EChannelRefreshAction.NONE
        }
        let opsData:IOpsData = channelObject.data

        let instanceConfigResponse:IInstanceConfigResponse = JSON.parse(wsEvent.data) as IInstanceConfigResponse
        if (instanceConfigResponse.flow === EInstanceMessageFlow.RESPONSE && instanceConfigResponse.action === EInstanceMessageAction.WEBSOCKET) {
            let newXterm:IXTerm = {
                namespace: opsData.websocketRequest.namespace,
                pod: opsData.websocketRequest.pod,
                container: opsData.websocketRequest.container,
                connected: true,
                selected: false,  // on opsTabContent this will be set to true and the rest of the terminal config will be done
                id: instanceConfigResponse.instance,
                socket: new WebSocket(channelObject.clusterUrl + '?challenge='+(instanceConfigResponse.data as string)),
                terminal: undefined
            }
            opsData.terminalManager.createTerminal(`${newXterm.namespace+'/'+newXterm.pod+'/'+newXterm.container}`, newXterm.socket!)
            //opsData.terminalManager.createTerminal(newXterm.namespace+'/'+newXterm.container.split('+')[0]+'/'+newXterm.container.split('+')[1], newXterm.socket!)
            refresh.action = EChannelRefreshAction.REFRESH
        }
        else {
            let opsMessage:IOpsMessageResponse = JSON.parse(wsEvent.data)
            switch (opsMessage.type) {
                case EInstanceMessageType.DATA:
                    if (opsMessage.flow === EInstanceMessageFlow.RESPONSE) {
                        switch (opsMessage.command) {
                            case EOpsCommand.DESCRIBE:
                                let scopedObject = opsData.scopedObjects.find(so => so.namespace === opsMessage.namespace && so.pod === opsMessage.pod && so.container === opsMessage.container)
                                if (scopedObject)
                                    refresh.data = JSON.parse(opsMessage.data)
                                else
                                    channelObject.notify?.('ops', ENotifyLevel.INFO, 'Data received for a non-scoped object')
                                if (opsData.onDescribeResponse) opsData.onDescribeResponse({event:'describe', data:refresh.data})
                                refresh.action = EChannelRefreshAction.REFRESH
                                break
                            }
                    }
                    else {
                        console.log('*************unhandled', opsMessage)
                        refresh.action = EChannelRefreshAction.REFRESH
                    }
                    break
                case EInstanceMessageType.SIGNAL:
                    let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                    if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.COMMAND) {
                        channelObject.notify?.('ops', signalMessage.level as any as ENotifyLevel, signalMessage.text||'No info')
                        refresh.action = EChannelRefreshAction.REFRESH
                    }
                    else if (opsMessage.flow === EInstanceMessageFlow.UNSOLICITED) {
                        if (signalMessage.text) {
                            if (signalMessage.level === ESignalMessageLevel.WARNING) channelObject.notify?.('ops', ENotifyLevel.WARNING, signalMessage.text)
                            else if (signalMessage.level === ESignalMessageLevel.ERROR) channelObject.notify?.('ops', ENotifyLevel.ERROR, signalMessage.text)
                            else channelObject.notify?.('ops', ENotifyLevel.INFO, signalMessage.text)
                            
                            refresh.action = EChannelRefreshAction.REFRESH
                        }
                        if (signalMessage.event === ESignalMessageEvent.ADD) {
                            opsData.scopedObjects.push( {
                                namespace: signalMessage.namespace!,
                                pod: signalMessage.pod!,
                                container: signalMessage.container!
                            })
                            refresh.action = EChannelRefreshAction.REFRESH
                        }
                        else if (signalMessage.event === ESignalMessageEvent.DELETE) {
                            let i = opsData.scopedObjects.findIndex(so => so.namespace === signalMessage.namespace && so.pod === signalMessage.pod && (!signalMessage.container || so.container === signalMessage.container))
                            while (i>=0) {
                                opsData.scopedObjects.splice(i,1)
                                i = opsData.scopedObjects.findIndex(so => so.namespace === signalMessage.namespace && so.pod === signalMessage.pod && (!signalMessage.container || so.container === signalMessage.container))
                            }
                            refresh.action = EChannelRefreshAction.REFRESH
                        }
                    }
                    else {
                        let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                        if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                            channelObject.instanceId = signalMessage.instance
                            if (signalMessage.text) {
                                refresh.action = EChannelRefreshAction.REFRESH
                                channelObject.notify?.('ops', ENotifyLevel.INFO, signalMessage.text)
                            }
                        }
                        else {
                            console.log('wsEvent.data on ops', wsEvent.data)
                        }
                    }
                    break
                default:
                    console.log(`Invalid message type ${opsMessage.type}`)
                    break
            }
        }

        return refresh
    }

    waitForInstanceAndStart = async (channelObject:IChannelObject, shell:IScopedObject) : Promise<void> => {
        if (!channelObject.webSocket) {
            console.log('No webSocket for terminal launch while waiting for instance')
            return
        }

        let opsData:IOpsData = channelObject.data

        while (channelObject.instanceId === '') {
            await new Promise(resolve => setTimeout(resolve, 10))
        }
        let instanceConfig:IInstanceConfig = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.WEBSOCKET,
            channel: EInstanceMessageChannel.OPS,
            type: EInstanceMessageType.DATA,
            accessKey: channelObject.accessString!,
            instance: channelObject.instanceId,
            namespace: shell.namespace,
            group: '',
            pod: shell.pod,
            container: shell.container,
            objects: EInstanceConfigObject.PODS,
            scope: '',
            view: EInstanceConfigView.CONTAINER
        }
        opsData.websocketRequest = {
            namespace: shell.namespace,
            pod: shell.pod,
            container: shell.container
        }
        channelObject.webSocket.send(JSON.stringify( instanceConfig ))
    }
    
    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.config = new OpsConfig()
        channelObject.data = new OpsData()
        channelObject.instanceConfig = new OpsInstanceConfig()
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let opsData:IOpsData = channelObject.data
        let opsConfig:IOpsConfig= channelObject.config
        opsData.scopedObjects = []
        opsData.selectedTerminal = undefined
        opsData.paused = false
        opsData.started = true
        if (opsConfig.launchShell && opsConfig.shell) this.waitForInstanceAndStart(channelObject, opsConfig.shell)
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let opsData:IOpsData = channelObject.data
        opsData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let opsData:IOpsData = channelObject.data
        opsData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let opsData:IOpsData = channelObject.data
        opsData.paused = false
        opsData.started = false
        return false
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return false
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

    // cleanANSI(text: string): string {
    //     const regexAnsi = /\x1b\[[0-9;]*[mKHVfJrcegH]|\x1b\[\d*n/g;
    //     return text.replace(regexAnsi, '') // replace all matches with empty strings
    // }

}    
