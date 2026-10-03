import { WebampMachine } from './WebampMachine'

/**
 * Channel state.
 *
 * This is what makes the player survive tab switches: Kwirth keeps
 * `channelObject.data` in the ITabObject, which lives outside React's render
 * tree. The TabContent mounts and unmounts; this does not.
 *
 * That is why the WebampMachine instance is kept here and NOT in a useState or
 * useRef of the component.
 */
export interface IWebampData {
    /** The music player (iframe). undefined until the channel is started. */
    machine?: WebampMachine

    /** Channel started (Kwirth start/stop). */
    started: boolean

    /** Channel paused (Kwirth pause/continue). */
    paused: boolean

    /** Incremented on every relevant event to force React refresh. */
    revision: number
}

export class WebampData implements IWebampData {
    machine?: WebampMachine = undefined
    started = false
    paused = false
    revision = 0
}
