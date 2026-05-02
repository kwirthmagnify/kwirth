import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

interface ManagedTerminal {
    term: Terminal
    fitAddon: FitAddon
    started: boolean
    index: number
    socket: WebSocket
}

class TerminalManager {
    public terminals: Map<string, ManagedTerminal> = new Map()
    public onClose?: (id:string) => void


    constructor (onCloseCallback?: (id:string) => void) {
        this.onClose = onCloseCallback
    }

    attachTerminal(id: string): ManagedTerminal | undefined {
        const existingTerminal = this.terminals.get(id)
        if (existingTerminal) return existingTerminal
        return undefined
    }

    createTerminal(id: string, socket:WebSocket): ManagedTerminal {
        const existingTerminal = this.terminals.get(id)
        if (existingTerminal) return existingTerminal

        const term = new Terminal({
            fontSize: 14,
            scrollback: 10000            
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        if (!socket) console.log('****horror****')

        socket.onopen = () => term.write('Connected to backend...\r\n')
        socket.onmessage = (event) => {
            term.write(event.data)
        }
        socket.onclose = () => {
            term.write('\r\nConnection closed.\r\n')
            term.dispose()
            this.terminals.delete(id)
            if (this.onClose) this.onClose(id)
        }

        term.onData((data) => {
            if (socket) socket.send(data)
        })

        const managedTerminal: ManagedTerminal = { term, fitAddon, started:false, index:0, socket }
        this.terminals.set(id, managedTerminal)
        return managedTerminal
    }

    getTerminal(id: string): ManagedTerminal | undefined {
        return this.terminals.get(id)
    }

    destroyTerminal(id: string): void {
        const existingTerminal = this.terminals.get(id)
        if (!existingTerminal) return

        existingTerminal.term.dispose()
        this.terminals.delete(id)
    }
}

export type { ManagedTerminal }
export  { TerminalManager }