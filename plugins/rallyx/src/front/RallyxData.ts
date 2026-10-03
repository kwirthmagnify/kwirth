import { RallyxMachine } from './RallyxMachine'
import { IScoreEntry, IScoreStore } from './RallyxScores'

/**
 * Channel state.
 *
 * This is what makes the game survive tab switches: Kwirth stores
 * `channelObject.data` in the ITabObject, which lives outside React's render
 * tree. The TabContent mounts and unmounts; this does not.
 *
 * That is why the RallyxMachine instance is kept here and NOT in a useState or
 * useRef of the component.
 */
export interface IRallyxData {
    /** The game machine (iframe + Phaser). undefined until the channel is started. */
    machine?: RallyxMachine

    /** Channel started (Kwirth start/stop). */
    started: boolean

    /** Channel paused (Kwirth pause/continue). */
    paused: boolean

    /** Score of the current game. */
    score: number
    lives: number
    /** Current round (level). */
    round: number
    fuel: number

    /** Best score of the session. */
    highScore: number

    /** Score table, loaded when the channel starts. */
    scores: IScoreEntry[]

    /** Where the table is persisted. */
    scoreStore?: IScoreStore

    /** A finished game that has not been registered in the table yet. */
    pendingScore: boolean

    /** Game over. */
    gameOver: boolean

    /** Incremented on every relevant event to force a React refresh. */
    revision: number
}

export class RallyxData implements IRallyxData {
    machine?: RallyxMachine = undefined
    started = false
    paused = false
    score = 0
    lives = 0
    round = 0
    fuel = 0
    highScore = 0
    scores: IScoreEntry[] = []
    scoreStore?: IScoreStore = undefined
    pendingScore = false
    gameOver = false
    revision = 0
}
