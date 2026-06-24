import { IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
//import { Router } from 'express'
import dgram from 'dgram'
import net from 'net'
import { ISyslogConfig, ISyslogMessage } from '../types/ISyslogMessage'
import { UdpServer, TMessageCallback } from './UdpServer'
import { TcpServer } from './TcpServer'

export class SyslogProvider implements IProvider {
    public readonly id = 'syslog'
    public readonly providesRouter = false
    public readonly requiresApiKeyApi = false
    public router = undefined
    public routerAlias = undefined
    //public router: Router
    //public routerAlias: string | undefined = 'syslog'
    public apiKeyApi = undefined

    private subscribers = new Map<IProviderSubscriber, unknown>()
    private config: ISyslogConfig = { port: 513, protocol: 'both', tcpFraming: 'non-transparent', relayTargets: [], maxMessages: 10000, maxParallel: 20 }
    private configured = false
    private udpServer: UdpServer | undefined
    private tcpServer: TcpServer | undefined
    private relayUdpSocket: dgram.Socket | undefined
    private messageCount = 0
    private queue: Array<{ msg: ISyslogMessage, raw: Buffer }> = []
    private activeWorkers = 0
    private discardedCount = 0

    constructor(_clusterInfo: unknown, _kwirthData: unknown) {
        //this.router = Router()
    }

    addSubscriber = async (c: IProviderSubscriber, _data: unknown): Promise<void> => {
        this.subscribers.set(c, {})
    }

    removeSubscriber = async (c: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(c)
    }

    configure = (config: Record<string, unknown>): void => {
        this.config = { ...this.config, ...(config as Partial<ISyslogConfig>) }
        this.configured = true
    }

    private enqueue = (msg: ISyslogMessage, raw: Buffer): void => {
        if (this.queue.length >= this.config.maxMessages) {
            this.discardedCount++
            if (this.discardedCount % 1000 === 0) console.log(`[syslog] ${this.discardedCount} messages discarded (queue full, maxMessages=${this.config.maxMessages})`)
            return
        }
        this.queue.push({ msg, raw })
        this.processNext()
    }

    private processNext = (): void => {
        if (this.activeWorkers >= this.config.maxParallel || this.queue.length === 0) return
        const item = this.queue.shift()!
        this.activeWorkers++
        Promise.resolve().then(() => {
            this.relay(item.raw)
            for (const sub of this.subscribers.keys()) sub.processProviderEvent(this.id, item.msg)
            this.messageCount++
        }).finally(() => {
            this.activeWorkers--
            this.processNext()
        })
    }

    startProvider = async (): Promise<void> => {
        if (!this.configured) throw new Error('syslog provider has no configuration — create the ConfigMap entry before starting')
        const { port, protocol, tcpFraming } = this.config
        const onMessage: TMessageCallback = (msg: ISyslogMessage, raw: Buffer) => {
            this.enqueue(msg, raw)
        }
        if (protocol === 'udp' || protocol === 'both') {
            this.udpServer = new UdpServer(port, onMessage)
            try {
                await this.udpServer.start()
            } catch (err) {
                console.error(`[syslog] UDP server failed to start on port ${port}: ${err}`)
                this.udpServer = undefined
            }
        }
        if (protocol === 'tcp' || protocol === 'both') {
            this.tcpServer = new TcpServer(port, tcpFraming, onMessage)
            try {
                await this.tcpServer.start()
            } catch (err) {
                console.error(`[syslog] TCP server failed to start on port ${port}: ${err}`)
                this.tcpServer = undefined
            }
        }
    }

    stopProvider = async (): Promise<void> => {
        await this.udpServer?.stop()
        await this.tcpServer?.stop()
        this.relayUdpSocket?.close()
        this.relayUdpSocket = undefined
    }

    private relay(raw: Buffer): void {
        for (const target of this.config.relayTargets) {
            try {
                if (target.protocol === 'udp') {
                    if (!this.relayUdpSocket) this.relayUdpSocket = dgram.createSocket('udp4')
                    this.relayUdpSocket.send(raw, target.port, target.host)
                } else {
                    const lenPrefix = Buffer.from(`${raw.length} `)
                    const sock = net.connect(target.port, target.host, () => {
                        sock.write(Buffer.concat([lenPrefix, raw]))
                        sock.end()
                    })
                    sock.on('error', () => {})
                }
            } catch {}
        }
    }
}

export default SyslogProvider
