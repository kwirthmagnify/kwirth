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
    public onClose?: (id: string) => void

    constructor(onCloseCallback?: (id: string) => void) {
        this.onClose = onCloseCallback
    }

    attachTerminal(id: string): ManagedTerminal | undefined {
        return this.terminals.get(id)
    }

    createTerminal(id: string, socket: WebSocket): ManagedTerminal {
        const existingTerminal = this.terminals.get(id)
        if (existingTerminal) return existingTerminal

        const term = new Terminal({ fontSize: 14, scrollback: 10000 })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        socket.onopen = () => term.write('Connected to backend...\r\n')
        socket.onmessage = (event) => { term.write(event.data) }
        socket.onclose = () => {
            // already removed by the user (deleteSession disposed it): nothing left to close
            if (this.terminals.get(id)?.term !== term) return
            this.terminals.delete(id)
            if (this.onClose) this.onClose(id)
            /*
                xterm writes and renders ASYNCHRONOUSLY. Disposing it right after a write — or right after it was
                opened, which is what happens when the exec fails at once (a container without /bin/sh) — leaves a
                pending render running on a disposed terminal, and it throws an uncaught error that takes the page
                down. So: first the tab lets go of it (onClose unmounts the view), and it is disposed once the last
                write has been processed and the view has had a frame to go away.
            */
            term.write('\r\nConnection closed.\r\n', () => {
                setTimeout(() => {
                    try { term.dispose() }
                    catch (err) { console.warn('[ops] Error disposing a closed terminal:', err) }
                }, 100)
            })
        }
        term.onData((data) => { if (socket) socket.send(data) })

        const managedTerminal: ManagedTerminal = { term, fitAddon, started: false, index: 0, socket }
        this.terminals.set(id, managedTerminal)
        return managedTerminal
    }

    getTerminal(id: string): ManagedTerminal | undefined { return this.terminals.get(id) }

    destroyTerminal(id: string): void {
        const t = this.terminals.get(id)
        if (!t) return
        t.term.dispose()
        this.terminals.delete(id)
    }
}

export type { ManagedTerminal }
export { TerminalManager }
