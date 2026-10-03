import { PacmanMachine } from './PacmanMachine'
import { IScoreEntry, IScoreStore } from './PacmanScores'

/**
 * Estado del canal.
 *
 * Esto es lo que hace que la partida sobreviva a los cambios de pestana:
 * Kwirth guarda `channelObject.data` en el ITabObject, que vive fuera del
 * arbol de render de React. El TabContent se monta y se desmonta; esto no.
 *
 * Por eso la instancia de PacmanMachine se guarda aqui y NO en un useState
 * ni en un useRef del componente.
 */
export interface IPacmanData {
    /** La maquina del juego (iframe). undefined hasta que se arranca el canal. */
    machine?: PacmanMachine

    /** Canal arrancado (start/stop de Kwirth). */
    started: boolean

    /** Canal pausado (pause/continue de Kwirth). */
    paused: boolean

    /** Marcador de la partida en curso. */
    score: number
    lives: number
    level: number

    /** Mejor puntuacion de la sesion. */
    highScore: number

    /** Tabla de puntuaciones, cargada al iniciar el canal. */
    scores: IScoreEntry[]

    /** Donde se persiste la tabla. */
    scoreStore?: IScoreStore

    /** La partida acabada aun no se ha registrado en la tabla. */
    pendingScore: boolean

    /** Partida terminada. */
    gameOver: boolean

    /** Se incrementa en cada evento relevante para forzar refresco de React. */
    revision: number
}

export class PacmanData implements IPacmanData {
    machine?: PacmanMachine = undefined
    started = false
    paused = false
    score = 0
    lives = 0
    level = 0
    highScore = 0
    scores: IScoreEntry[] = []
    scoreStore?: IScoreStore = undefined
    pendingScore = false
    gameOver = false
    revision = 0
}
