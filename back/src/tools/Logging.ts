/*
    Four letters each, so the tag column lines up and the eye can skip it: what you are looking for is
    the id and the message, not which bucket the line belongs to.
*/
export enum ELogComponent {
    AUTH = 'auth',
    CORE = 'core',
    PROVIDER = 'prov',
    CHANNEL = 'chan',
    STORAGE = 'stor'
}

let ansiLog = true

const ENABLED_COMPONENTS: (ELogComponent | '*')[] = [ ELogComponent.CHANNEL, ELogComponent.CORE, ELogComponent.PROVIDER ]

const colors = {
  reset: '\x1b[0m',
  info: '\x1b[36m',
  trace: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  component: '\x1b[35m',
  gray: '\x1b[90m'
} as const

const logGeneric = (
        level: 'trace' | 'info' | 'warn' | 'error',
        color: string,
        component: ELogComponent,
        message: any
    ): void => {

    const isEnabled = ENABLED_COMPONENTS.includes('*') || ENABLED_COMPONENTS.includes(component)

    if (!isEnabled && level !== 'error') return

    const timestamp = new Date().toLocaleTimeString(undefined, { hour12: false})
    const label = level.toUpperCase()
    
    /*
        An object goes out ON ONE LINE. Indenting it looked nicer on screen but turned a single event
        into fifteen lines with no timestamp, no level and no component of their own: impossible to
        grep, and enough to bury everything around it.

        An Error is the exception and keeps its stack over several lines, because the stack IS the
        message. Note it serialises to `{}` under JSON.stringify — message and stack are not
        enumerable — so it has to be handled before the generic branch.
    */
    const formattedMessage = message instanceof Error
        ? `\n${message.stack ?? message.message}`
        : typeof message === 'object' && message !== null
            ? JSON.stringify(message)
            : message

    const output = `${ansiLog? colors.gray : ''}[${timestamp}]${ansiLog? colors.reset : ''} ` +
                   `${ansiLog? colors.component : ''}[${component}]${ansiLog? colors.reset : ''} ` +
                   `${ansiLog? color : ''}[${label}] ` +
                   `${formattedMessage}${ansiLog? colors.reset:''}`

    if (level === 'error') {
        console.error(output)
    }
    else {
        console.log(output)
    }
}

/*
    Takes a component like the rest of them. It used to hardcode CORE, and since its ONLY caller is the
    one the core lends to channels, everything a plugin traced showed up as if the core had said it.
*/
export const logTrace = (component: ELogComponent, message: unknown): void => {
    logGeneric('trace', colors.trace, component, message)
}

export const logInfo = (component: ELogComponent, message: unknown): void => {
    logGeneric('info', colors.info, component, message)
}

export const logWarning = (component: ELogComponent, message: unknown): void => {
    logGeneric('warn', colors.warning, component, message)
}

export const logError = (component: ELogComponent, message: any): void => {
    logGeneric('error', colors.error, component, message)
}

/**
 * What a component logs with: the usual levels, but always saying who is speaking.
 */
export interface IComponentLogger {
    info(message: unknown): void
    trace(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

/*
    A bare '[provider]' identifies nobody: in a Kwirth running fifteen providers they all write under
    the same label, so there is no way to tell which one is talking, nor to filter the log down to the
    one you care about. The component says what KIND of line this is, not whose it is.

    So the id goes in front of the message, the way channels already do it ('[excubitor] registry
    scan...'). The core puts it there instead of asking every provider to remember its own prefix:
    whatever has to be remembered ends up missing from half the lines.

    Objects are serialised ON ONE LINE rather than indented as the general format does: a provider log
    is usually a small value next to its explanation, and splitting it over five lines breaks exactly
    what this is here to fix — reading a provider's log at a glance. An Error keeps its stack, which is
    the one case where the extra lines earn their place.
*/
export const componentLogger = (component: ELogComponent, id: string): IComponentLogger => {
    const prefixed = (message: unknown): string => {
        if (message instanceof Error) return `[${id}] ${message.stack ?? message.message}`
        if (typeof message === 'object' && message !== null) return `[${id}] ${JSON.stringify(message)}`
        return `[${id}] ${String(message)}`
    }
    return {
        info: (message: unknown) => logGeneric('info', colors.info, component, prefixed(message)),
        trace: (message: unknown) => logGeneric('trace', colors.trace, component, prefixed(message)),
        warning: (message: unknown) => logGeneric('warn', colors.warning, component, prefixed(message)),
        error: (message: unknown) => logGeneric('error', colors.error, component, prefixed(message))
    }
}

/** Shorthand for the common case: a provider logging under its own id. */
export const providerLogger = (providerId: string): IComponentLogger => componentLogger(ELogComponent.PROVIDER, providerId)

export const setLogConfig = (ansi:boolean) => {
    ansiLog = ansi
}