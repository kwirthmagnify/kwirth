export interface IEchoData {
    lines: string[]
    paused: boolean
    started: boolean
}

export class EchoData implements IEchoData {
    lines: string[] = []
    paused = false
    started = false
}
