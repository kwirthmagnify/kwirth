import dgram from 'dgram'
import { ISyslogMessage } from '../types/ISyslogMessage'
import { SyslogParser } from './SyslogParser'

export type TMessageCallback = (msg: ISyslogMessage, raw: Buffer) => void

export class UdpServer {
    private socket: dgram.Socket | undefined
    private port: number
    private onMessage: TMessageCallback

    constructor(port: number, onMessage: TMessageCallback) {
        this.port = port
        this.onMessage = onMessage
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4')
            this.socket.on('message', (buf, rinfo) => {
                try {
                    const msg = SyslogParser.parse(buf.toString('utf-8'))
                    msg.sourceIp = rinfo.address
                    this.onMessage(msg, buf)
                } catch {}
            })
            this.socket.on('error', (err) => { this.socket?.close(); reject(err) })
            this.socket.bind(this.port, () => resolve())
        })
    }

    stop(): Promise<void> {
        return new Promise(resolve => {
            if (!this.socket) return resolve()
            this.socket.close(() => resolve())
            this.socket = undefined
        })
    }
}
