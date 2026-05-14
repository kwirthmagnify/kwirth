import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IContentProps, ISetupProps } from '../IChannel'
import { ILogMessage, InstanceConfigScopeEnum, IInstanceMessage, InstanceMessageActionEnum, InstanceMessageFlowEnum, InstanceMessageTypeEnum, ISignalMessage } from '@jfvilas/kwirth-common'
import { LogIcon, LogSetup } from './LogSetup'
import { LogTabContent } from './LogTabContent'
import { LogData, ILogLine, ILogData } from './LogData'
import { ILogConfig, LogInstanceConfig, ELogSortOrderEnum, LogConfig } from './LogConfig'
import { ENotifyLevel } from '../../tools/Global'

export class LogChannel implements IChannel {
    private setupVisible = false
    private notify: (level:ENotifyLevel, message:string) => void = (level:ENotifyLevel, message:string) => {}
    SetupDialog: FC<ISetupProps> = LogSetup
    TabContent: FC<IContentProps> = LogTabContent
    channelId = 'log'
    
    requiresSetup() { return true }
    requiresSettings() { return false }
    requiresMetrics() { return false }
    requiresAccessString() { return false }
    requiresFrontChannels() { return true }
    requiresClusterUrl() { return false }
    requiresWebSocket() { return false }
    setNotifier(notifier: (level:ENotifyLevel, message:string) => void) { this.notify = notifier }

    getScope() { return InstanceConfigScopeEnum.VIEW }
    getChannelIcon(): JSX.Element { return LogIcon }
    
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        let logData:ILogData = channelObject.data
        let logConfig:ILogConfig = channelObject.config

        const getMsgEpoch = (lmsg:ILogLine) =>{
            return (new Date(lmsg.text.split(' ')[0])).getTime()
        }

        let logMessage:ILogMessage = JSON.parse(wsEvent.data)

        switch (logMessage.type) {
            case InstanceMessageTypeEnum.DATA:
                action = EChannelRefreshAction.REFRESH

                let bname = logMessage.namespace+'/'+logMessage.pod+'/'+logMessage.container
                let text = logMessage.text
                if (logData.buffers.get(bname)) {
                    text = logData.buffers.get(bname) + text
                    logData.buffers.set(bname,'')
                }
                if (!text.endsWith('\n')) {
                    let i = text.lastIndexOf('\n')
                    let next = text.substring(i)
                    logData.buffers.set(bname, next)
                    text = text.substring(0,i)
                }

                for (let line of text.split('\n')) {
                    if (line.trim() === '') continue

                    let logLine:ILogLine = {
                        text: line,
                        namespace: logMessage.namespace,
                        pod: logMessage.pod,
                        container: logMessage.container,
                        type: logMessage.type
                    }
                    if (logConfig.startDiagnostics) {
                        if (logData.messages.length < logConfig.maxMessages) {
                            let cnt = logData.counters.get(bname)
                            if (!cnt) {
                                logData.counters.set(bname,0)
                                cnt = 0
                            }
                            if (cnt < logConfig.maxPerPodMessages) {
                                switch (logConfig.sortOrder) {
                                    case ELogSortOrderEnum.POD:
                                        let podIndex = logData.messages.findLastIndex(m => m.container===logLine.container && m.pod===logLine.pod && m.namespace===logLine.namespace)
                                        logData.messages.splice(podIndex+1,0,logLine)
                                        break
                                    case ELogSortOrderEnum.TIME:
                                        let timeIndex = logData.messages.findLastIndex(m => getMsgEpoch(m) < getMsgEpoch(logLine))
                                        logData.messages.splice(timeIndex+1,0,logLine)
                                        break
                                    default:
                                        logData.messages.push(logLine)
                                        break
                                }
                                logData.counters.set(bname, ++cnt)
                            }
                            if ([...logData.counters.values()].reduce((prev,acc) => prev+acc, 0) > logConfig.maxMessages) {
                                action = EChannelRefreshAction.STOP
                            }
                        }
                        else {
                            action = EChannelRefreshAction.STOP
                        }
                    }
                    else {
                        logData.messages.push(logLine)
                        if (logData.messages.length > logConfig.maxMessages) logData.messages.splice(0, logData.messages.length - logConfig.maxMessages)
                    }
                }
                break
            case InstanceMessageTypeEnum.SIGNAL:
                let instanceMessage:IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === InstanceMessageFlowEnum.RESPONSE && instanceMessage.action === InstanceMessageActionEnum.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                else if (instanceMessage.flow === InstanceMessageFlowEnum.RESPONSE && instanceMessage.action === InstanceMessageActionEnum.RECONNECT) {
                    let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                    logData.messages.push({
                        text: signalMessage.text || '',
                        namespace: '',
                        pod: '',
                        container: '',
                        type: InstanceMessageTypeEnum.DATA
                    })
                }
                else {
                    logData.messages.push(logMessage)
                    action = EChannelRefreshAction.REFRESH
                }
                break
            default:
                console.log(`Invalid message type`, logMessage)
                break
        }

        return {
            action
        }
    }

    initChannel(channelObject:IChannelObject): boolean {
        channelObject.instanceConfig = new LogInstanceConfig()
        channelObject.config = new LogConfig()
        channelObject.data = new LogData()
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let logInstanceConfig:LogInstanceConfig = channelObject.instanceConfig
        let logConfig:LogInstanceConfig = new LogInstanceConfig()
        let logData:ILogData = channelObject.data
        logData.paused = false
        logData.started = true

        if (channelObject.config.startDiagnostics) {
            logConfig = {
                timestamp: true,
                previous: false,
                fromStart: true
            }
        }
        else {
            logConfig = {
                timestamp: logInstanceConfig.timestamp,
                previous: logInstanceConfig.previous,
                fromStart: logInstanceConfig.fromStart,
                ...(!logConfig.fromStart? {} : {startTime: logInstanceConfig.startTime})
            }
        }
        logData.messages = []
        channelObject.instanceConfig = logConfig
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let logData:ILogData = channelObject.data
        logData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let logData:ILogData = channelObject.data
        logData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let logData:ILogData = channelObject.data
        if (logData.started) {
            logData.messages.push({
                text: '=========================================================================',
                type: InstanceMessageTypeEnum.DATA,
                namespace: '',
                pod: '',
                container: ''
            })
        }
        logData.started = false
        logData.paused = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        let logData:ILogData = channelObject.data
        logData.messages.push({
            type: InstanceMessageTypeEnum.DATA,
            text: '*** Lost connection ***',
            namespace: '',
            pod: '',
            container: ''
        })
        return true
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
