import net from 'net'
import { TTcpFraming, ISyslogMessage } from '../types/ISyslogMessage'
import { SyslogParser } from './SyslogParser'
import { TMessageCallback } from './UdpServer'

type TFraming = 'octet-counting' | 'non-transparent' | 'unknown'

interface IConnState {
    buffer: Buffer
    framing: TFraming
    sourceIp: string
}

export class TcpServer {
    private server: net.Server | undefined
    private port: number
    private defaultFraming: TTcpFraming
    private onMessage: TMessageCallback
    private connStates = new Map<net.Socket, IConnState>()

    constructor(port: number, defaultFraming: TTcpFraming, onMessage: TMessageCallback) {
        this.port = port
        this.defaultFraming = defaultFraming
        this.onMessage = onMessage
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = net.createServer(sock => this.handleConnection(sock))
            this.server.on('error', reject)
            this.server.listen(this.port, () => resolve())
        })
    }

    stop(): Promise<void> {
        return new Promise(resolve => {
            for (const sock of this.connStates.keys()) sock.destroy()
            this.connStates.clear()
            if (!this.server) return resolve()
            this.server.close(() => resolve())
            this.server = undefined
        })
    }

    private handleConnection(sock: net.Socket) {
        const state: IConnState = { buffer: Buffer.alloc(0), framing: 'unknown', sourceIp: sock.remoteAddress ?? '' }
        this.connStates.set(sock, state)
        sock.on('data', chunk => this.handleData(state, chunk))
        sock.on('close', () => this.connStates.delete(sock))
        sock.on('error', () => { this.connStates.delete(sock); sock.destroy() })
    }

    private handleData(state: IConnState, chunk: Buffer) {
        state.buffer = Buffer.concat([state.buffer, chunk])

        if (state.framing === 'unknown') {
            const first = state.buffer[0]
            state.framing = (first >= 0x30 && first <= 0x39) ? 'octet-counting' : 'non-transparent'
        }

        if (state.framing === 'octet-counting') {
            this.processOctetCounting(state)
        } else {
            this.processNonTransparent(state)
        }
    }

    private processOctetCounting(state: IConnState) {
        while (state.buffer.length > 0) {
            const spaceIdx = state.buffer.indexOf(0x20)
            if (spaceIdx < 0) break
            const msgLen = parseInt(state.buffer.slice(0, spaceIdx).toString('ascii'), 10)
            if (isNaN(msgLen) || msgLen <= 0) { state.buffer = Buffer.alloc(0); break }
            const end = spaceIdx + 1 + msgLen
            if (state.buffer.length < end) break
            this.dispatch(state.buffer.slice(spaceIdx + 1, end), state.sourceIp)
            state.buffer = state.buffer.slice(end)
        }
    }

    private processNonTransparent(state: IConnState) {
        let idx: number
        while ((idx = state.buffer.indexOf(0x0a)) >= 0) {
            const end = idx > 0 && state.buffer[idx - 1] === 0x0d ? idx - 1 : idx
            this.dispatch(state.buffer.slice(0, end), state.sourceIp)
            state.buffer = state.buffer.slice(idx + 1)
        }
    }

    private dispatch(raw: Buffer, sourceIp: string) {
        try {
            const msg = SyslogParser.parse(raw.toString('utf-8'))
            msg.sourceIp = sourceIp
            this.onMessage(msg, raw)
        } catch {}
    }
}
