import { Terminal } from 'xterm'
import { TerminalManager } from './Terminal/TerminalManager'

export interface IXTerm {
    namespace: string
    pod: string
    container: string
    id: string
    connected: boolean
    selected: boolean
    socket: WebSocket | undefined
    terminal: Terminal|undefined
}

export interface IWebsocketRequest {
    namespace: string
    pod: string
    container: string
}

export interface IScopedObject {
    namespace: string
    pod: string
    container: string
}

export interface IOpsData {
    scopedObjects: IScopedObject[]
    paused: boolean
    started: boolean
    websocketRequest: IWebsocketRequest
    terminalManager: TerminalManager
    selectedTerminal: string | undefined
    onDescribeResponse?: (data:any) => void
}

export class OpsData implements IOpsData {
    messages:string[] = []
    selectedTerminal: undefined
    terminalManager: TerminalManager = new TerminalManager()
    paused = false
    started = false
    websocketRequest: IWebsocketRequest = {
        namespace: '',
        pod: '',
        container: ''
    }
    scopedObjects = []
}
