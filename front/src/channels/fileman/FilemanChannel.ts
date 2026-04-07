import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { FilemanInstanceConfig, FilemanConfig } from './FilemanConfig'
import { FilemanSetup, FilemanIcon } from './FilemanSetup'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ESignalMessageEvent, IInstanceMessage, ISignalMessage } from "@kwirthmagnify/kwirth-common"
import { EFilemanCommand, FilemanData, IFilemanMessageResponse, IFilemanData } from './FilemanData'
import { FilemanTabContent } from './FilemanTabContent'
import { v4 as uuid } from 'uuid'
import { ENotifyLevel } from '../../tools/Global'
import { IFileObject } from '@jfvilas/react-file-manager'

interface IFilemanMessage extends IInstanceMessage {
    msgtype: 'filemanmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EFilemanCommand
    params?: string[]
}

export class FilemanChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = FilemanSetup
    TabContent: FC<IContentProps> = FilemanTabContent
    channelId = 'fileman'
    
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true
    }

    getScope() { return 'fileman$read'}
    getChannelIcon(): JSX.Element { return FilemanIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let msg:IFilemanMessage = JSON.parse(wsEvent.data)

        let filemanData:IFilemanData = channelObject.data
        switch (msg.type) {
            case EInstanceMessageType.DATA: {
                let response = JSON.parse(wsEvent.data) as IFilemanMessageResponse
                switch(response.action) {
                    case EInstanceMessageAction.COMMAND: {
                        switch(response.command) {
                            case EFilemanCommand.HOME:
                                let data = response.data as string[]
                                let nss = Array.from (new Set (data.map(n => n.split('/')[0])))
                                nss.forEach(ns => {
                                    if (!filemanData.files.some(f => f.path === '/'+ ns)) {
                                        filemanData.files.push ({ name: ns, isDirectory: true, path: '/'+ ns, class:'namespace' })
                                    }
                                    let podNames = Array.from (new Set (data.filter(a => a.split('/')[0]===ns).map(o => o.split('/')[1])))
                                    podNames.forEach(p => {
                                        if (!filemanData.files.some(f => f.path === '/'+ns+'/'+p)) {
                                            filemanData.files.push({ name: p, isDirectory: true, path: '/'+ns+'/'+p, class:'pod' })
                                        }
                                        let conts = Array.from (new Set (data.filter(a => a.split('/')[0]===ns && a.split('/')[1]===p).map(o => o.split('/')[2])))
                                        conts.forEach(c => {
                                            if (!filemanData.files.some(f => f.path === '/'+ns+'/'+p+'/'+c)) {
                                                filemanData.files.push ({ name: c, isDirectory: true, path: '/'+ns+'/'+p+'/'+c, class:'container' })
                                            }
                                        })
                                    })
                                })
                                filemanData.files=[...filemanData.files]
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            case EFilemanCommand.DIR:
                                filemanData.unlock?.()
                                let content = JSON.parse(response.data)
                                if (content.status!=='Success') {
                                    channelObject.notify?.('fileman', ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                else {
                                    for (let o of content.metadata.object) {
                                        let name = o.name.split('/')[o.name.split('/').length-1]
                                        let e:IFileObject = { 
                                            name,
                                            isDirectory: (o.type===1),
                                            path: o.name,
                                            data: {
                                                updatedAt: new Date(+o.time).toISOString(),
                                                size: +o.size,
                                                ...(o.type===0? {class:'file'}:{})
                                            }
                                        }
                                        filemanData.files = filemanData.files.filter(f => f.path !== e.path)
                                        filemanData.files.push (e)
                                    }
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            case EFilemanCommand.RENAME: {
                                let content = JSON.parse(response.data)
                                if (content.status!=='Success') {
                                    channelObject.notify?.('fileman', ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            }
                            case EFilemanCommand.DELETE: {
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    let fname = content.metadata.object
                                    filemanData.files = filemanData.files.filter(f => f.path !== fname)
                                    filemanData.files = filemanData.files.filter(f => !f.path.startsWith(fname+'/'))
                                }
                                else {
                                    channelObject.notify?.('fileman', ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            }
                            case EFilemanCommand.MOVE:
                            case EFilemanCommand.COPY:
                            case EFilemanCommand.CREATE: {
                                let content = JSON.parse(response.data)
                                if (content.status==='Success') {
                                    filemanData.files = filemanData.files.filter(f => f.path !== content.metadata.object)
                                    let e:IFileObject = { 
                                        name: (content.metadata.object as string).split('/').slice(-1)[0],
                                        isDirectory: (content.metadata.type===1),
                                        path: content.metadata.object,
                                        data: {
                                            updatedAt: new Date(+content.metadata.time).toISOString(), 
                                            size: +content.metadata.size,
                                            ...(content.metadata.type.type===0? {class:'file'}:{})
                                        }
                                    }
                                    filemanData.files.push(e)
                                }
                                else {
                                    channelObject.notify?.('fileman', ENotifyLevel.ERROR, 'ERROR: '+ (content.text || content.message))
                                }
                                return {
                                    action: EChannelRefreshAction.REFRESH
                                }
                            }
                        }
                    }
                }
                return {
                    action: EChannelRefreshAction.NONE
                }
            }
            case EInstanceMessageType.SIGNAL:
                let signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE) {
                    switch(signalMessage.action) {
                        case EInstanceMessageAction.START:
                            channelObject.instanceId = signalMessage.instance
                            break
                        case EInstanceMessageAction.RI:
                            filemanData.ri = signalMessage.data
                            break
                        case EInstanceMessageAction.COMMAND:
                            if (signalMessage.text) channelObject.notify?.('fileman', signalMessage.level as any as ENotifyLevel, signalMessage.text)
                            break
                        default:
                            if (signalMessage.text) channelObject.notify?.('fileman', signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                }
                else if (signalMessage.flow === EInstanceMessageFlow.UNSOLICITED) {

                    if (signalMessage.event === ESignalMessageEvent.ADD) {
                        if (!filemanData.ri) {
                            // just connected, we request endpoints id for uload/dload
                            let instanceConfig:IInstanceMessage = {
                                action: EInstanceMessageAction.RI,
                                channel: 'fileman',
                                flow: EInstanceMessageFlow.REQUEST,
                                type: EInstanceMessageType.SIGNAL,
                                instance: channelObject.instanceId
                            }
                            channelObject.webSocket!.send(JSON.stringify( instanceConfig ))
                        }

                        // just connected, we request HOME dir
                        let filemanMessage:IFilemanMessage = {
                            flow: EInstanceMessageFlow.REQUEST,
                            action: EInstanceMessageAction.COMMAND,
                            channel: 'fileman',
                            type: EInstanceMessageType.DATA,
                            accessKey: channelObject.accessString!,
                            instance: channelObject.instanceId,
                            id: uuid(),
                            command: EFilemanCommand.HOME,
                            namespace: signalMessage.namespace!,
                            group: '',
                            pod: signalMessage.pod!,
                            container: signalMessage.container!,
                            params: [],
                            msgtype: 'filemanmessage'
                        }
                        channelObject.webSocket!.send(JSON.stringify( filemanMessage ))

                        if (signalMessage.text) channelObject.notify?.('fileman', signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                    else if (signalMessage.event === ESignalMessageEvent.DELETE) {
                        filemanData.files = filemanData.files.filter(f => !f.path.startsWith('/'+signalMessage.namespace+'/'+signalMessage.pod+'/'))
                        filemanData.files = filemanData.files.filter(f => f.path!=='/'+signalMessage.namespace+'/'+signalMessage.pod)
                        if (signalMessage.text) channelObject.notify?.('fileman', signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                    else {
                        if (signalMessage.text) channelObject.notify?.('fileman', signalMessage.level as any as ENotifyLevel, signalMessage.text)
                    }
                }
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            default:
                console.log(`Invalid message type ${msg.type}`)
                return {
                    action: EChannelRefreshAction.NONE
                }
        }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new FilemanInstanceConfig()
        let config = new FilemanConfig()
        let data = new FilemanData()

        channelObject.config = config
        channelObject.data = data

        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let filemanData:IFilemanData = channelObject.data
        filemanData.paused = false
        filemanData.started = true;
        filemanData.files=[]
        filemanData.currentPath='/'
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let filemanData:IFilemanData = channelObject.data
        filemanData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let filemanData:IFilemanData = channelObject.data
        filemanData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let filemanData:IFilemanData = channelObject.data
        filemanData.paused = false
        filemanData.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return false
    }
    
    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
