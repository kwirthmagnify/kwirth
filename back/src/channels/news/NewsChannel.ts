import { IInstanceConfig, ISignalMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, IInstanceMessage, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel'
import { Request, Response } from 'express'
import { ELogComponent, logInfo } from '../../tools/Logging'
import https from 'https'
import http from 'http'

const POLL_INTERVAL_MS = 5 * 60 * 1000

export interface INewsItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
    category: string
}

interface INewsMessageResponse {
    msgtype: 'newsmessageresponse'
    channel: 'news'
    type: EInstanceMessageType
    action: EInstanceMessageAction
    flow: EInstanceMessageFlow
    instance: string
    item?: INewsItem
}

const FEEDS: Record<string, { url: string; source: string }> = {
    kubernetes: { url: 'https://kubernetes.io/feed.xml', source: 'kubernetes.io' },
    ai: { url: 'https://rss.arxiv.org/rss/cs.AI', source: 'arxiv.org' }
}

interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    selectedFeeds: string[]
    paused: boolean
    seenLinks: Set<string>
    assets: IAsset[]
    pollInterval?: NodeJS.Timeout
}

class NewsChannel implements IChannel {
    readonly channelId = 'news'
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: []
    }
    clusterInfo: ClusterInfo
    backChannelObject: IBackChannelObject
    webSockets: {
        ws: WebSocket
        lastRefresh: number
        instances: IInstance[]
    }[] = []

    constructor(clusterInfo: ClusterInfo, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'news',
            routable: false,
            pauseable: true,
            modifiable: false,
            reconnectable: true,
            metrics: false,
            sources: [EClusterType.KUBERNETES, EClusterType.DOCKER],
            endpoints: [],
            websocket: false,
            cluster: true,
            resourced: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    startChannel = async () => {}

    processProviderEvent(_providerId: string, _obj: unknown): void {}

    async endpointRequest(_endpoint: string, _req: Request, _res: Response): Promise<void> {}

    async websocketRequest(_newWebSocket: WebSocket): Promise<void> {}

    containsAsset = (webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) return socket.instances.some(i => i.assets.some(a => a.podNamespace === podNamespace && a.podName === podName && a.containerName === containerName))
        return false
    }

    containsInstance = (instanceId: string): boolean => {
        return this.webSockets.some(socket => socket.instances.some(i => i.instanceId === instanceId))
    }

    processCommand = async (_webSocket: WebSocket, _instanceMessage: IInstanceMessage): Promise<boolean> => {
        return true
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        logInfo(ELogComponent.CHANNEL, `News: start instance ${instanceConfig.instance}`)

        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }

        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            const newInstance: IInstance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance,
                selectedFeeds: instanceConfig.data?.selectedFeeds ?? Object.keys(FEEDS),
                paused: false,
                seenLinks: new Set<string>(),
                assets: []
            }
            socket.instances.push(newInstance)
            instance = newInstance
            instance.pollInterval = setInterval(
                (ws: WebSocket, i: IInstance) => this.pollFeeds(ws, i),
                POLL_INTERVAL_MS,
                webSocket, instance
            ) as unknown as NodeJS.Timeout
            this.pollFeeds(webSocket, instance)
        }
        instance.assets.push({ podNamespace, podName, containerName })
        return true
    }

    deleteObject = async (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _podNamespace: string, _podName: string, _containerName: string): Promise<boolean> => {
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            if (action === EInstanceMessageAction.PAUSE) instance.paused = true
            if (action === EInstanceMessageAction.CONTINUE) instance.paused = false
        } else {
            this.sendSignalMessage(webSocket, action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'News instance not found')
        }
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'News instance stopped')
        } else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'News instance not found')
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(i => i.instanceId === instanceId)
            if (pos >= 0) {
                clearInterval(socket.instances[pos].pollInterval)
                socket.instances.splice(pos, 1)
            } else {
                logInfo(ELogComponent.CHANNEL, `News instance ${instanceId} not found, cannot delete`)
            }
        } else {
            logInfo(ELogComponent.CHANNEL, 'WebSocket not found on News')
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => {
        return Boolean(this.webSockets.find(s => s.ws === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const instance of socket.instances) clearInterval(instance.pollInterval)
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        } else {
            logInfo(ELogComponent.CHANNEL, 'WebSocket not found on News for remove')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        logInfo(ELogComponent.CHANNEL, 'WebSocket not found on News')
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.webSockets) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    // PRIVATE

    private fetchUrl = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http
            const req = protocol.get(url, { headers: { 'User-Agent': 'kwirth-news/1.0' } }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    resolve(this.fetchUrl(res.headers.location))
                    return
                }
                let data = ''
                res.on('data', (chunk: string) => data += chunk)
                res.on('end', () => resolve(data))
                res.on('error', reject)
            })
            req.on('error', reject)
        })
    }

    private parseRssItems = (xml: string, source: string, category: string): INewsItem[] => {
        const items: INewsItem[] = []
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match
        while ((match = itemRegex.exec(xml)) !== null) {
            const itemXml = match[1]
            const title = (/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(itemXml) || /<title>([\s\S]*?)<\/title>/.exec(itemXml))?.[1] || ''
            const link = (/<link>([\s\S]*?)<\/link>/.exec(itemXml) || /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(itemXml))?.[1] || ''
            const description = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(itemXml) || /<description>([\s\S]*?)<\/description>/.exec(itemXml))?.[1] || ''
            const pubDate = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemXml))?.[1] || new Date().toISOString()
            if (title.trim() && link.trim()) {
                items.push({
                    title: title.trim(),
                    link: link.trim(),
                    description: description.replace(/<[^>]*>/g, '').trim().substring(0, 300),
                    pubDate: pubDate.trim(),
                    source,
                    category
                })
            }
        }
        return items
    }

    private pollFeeds = async (ws: WebSocket, instance: IInstance): Promise<void> => {
        if (instance.paused) return
        for (const category of Object.keys(FEEDS).filter(f => instance.selectedFeeds.includes(f))) {
            const feed = FEEDS[category]
            try {
                const xml = await this.fetchUrl(feed.url)
                const items = this.parseRssItems(xml, feed.source, category)
                for (const item of items) {
                    if (!instance.seenLinks.has(item.link)) {
                        instance.seenLinks.add(item.link)
                        const msg: INewsMessageResponse = {
                            msgtype: 'newsmessageresponse',
                            channel: 'news',
                            action: EInstanceMessageAction.NONE,
                            flow: EInstanceMessageFlow.UNSOLICITED,
                            type: EInstanceMessageType.DATA,
                            instance: instance.instanceId,
                            item
                        }
                        ws.send(JSON.stringify(msg))
                    }
                }
            } catch (err) {
                logInfo(ELogComponent.CHANNEL, `News: error polling ${category} feed: ${err}`)
            }
        }
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const resp: ISignalMessage = {
            action,
            flow,
            channel: 'news',
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
    }

    private getInstance = (webSocket: WebSocket, instanceId: string): IInstance | undefined => {
        const socket = this.webSockets.find(entry => entry.ws === webSocket)
        if (socket) return socket.instances.find(i => i.instanceId === instanceId)
        return undefined
    }
}

export { NewsChannel }
