import { ELogLevel, IKwirthLogSettings, ILogComponentInfo } from '@kwirthmagnify/kwirth-common'

/*
    Four letters each, so the tag column lines up and the eye can skip it: what you are looking for is
    the id and the message, not which bucket the line belongs to.
*/
export enum ELogComponent {
    AUTH = 'auth',
    CORE = 'core',
    PROVIDER = 'prov',
    CHANNEL = 'chan',
    SENDER = 'send',
    STORAGE = 'stor'
}

/*
    What each component writes, and whether the output carries colour.

    Which components were enabled used to be a constant of this module: 'auth' and 'stor' were off with no
    way of turning them on, and there was no level filter at all. Colour did have a way in — the ANSILOG
    variable, through setLogConfig() — but nothing survived a restart.

    Both are now configured from Kwirth's settings and applied hot, through applyLogSettings(). Precedence
    for colour is the usual one: what is stored wins, then ANSILOG, then the default — which works because
    setLogConfig() runs at the very start and the stored settings are applied afterwards.
*/
let ansiLog = true

/*
    The default is EVERYTHING ON, at 'info': what a Kwirth with nothing configured writes. Whoever wants
    less turns it down; nobody has to discover that a component exists in order to start seeing it.

    It is a change from before, where the enabled ones were a constant of this module and 'auth' and
    'stor' were left out — mute, with their failures swallowed and no way of turning them on.
*/
const DEFAULT_LEVELS: Record<ELogComponent, ELogLevel> = {
    [ELogComponent.AUTH]: ELogLevel.INFO,
    [ELogComponent.CORE]: ELogLevel.INFO,
    [ELogComponent.PROVIDER]: ELogLevel.INFO,
    [ELogComponent.CHANNEL]: ELogLevel.INFO,
    [ELogComponent.SENDER]: ELogLevel.INFO,
    [ELogComponent.STORAGE]: ELogLevel.INFO
}

let levels: Record<ELogComponent, ELogLevel> = { ...DEFAULT_LEVELS }

/*
    Per-id overrides: 'chan:excubitor' beats 'chan'. One channel at trace while the rest stay at warn is
    the normal way of debugging one plugin without drowning in everything else's log.

    They live in the same map as the components — the settings are a flat Record — and are told apart by
    the colon, which no component id carries.
*/
const overrideKey = (component: ELogComponent, id: string): string => `${component}:${id}`

/*
    The ids each component has written under, so the dialog can offer them.

    They are collected from componentLogger() rather than asked of a registry: it is called when a
    channel, a provider or a sender starts, so what is listed is exactly what can write. There is no
    registry to plug in and nothing to keep in step — and an id that never appears here is one that has
    never had a logger, so there would be nothing to configure about it either.
*/
const knownIds: Record<string, Set<string>> = {}

/*
    From most to least talkative. A line is written when its level reaches its component's threshold, so
    the comparison is an index: 'trace' (0) does not reach a component set to 'warn' (2), and 'off' (4)
    is unreachable by anything.
*/
const SEVERITY: ELogLevel[] = [ELogLevel.TRACE, ELogLevel.INFO, ELogLevel.WARN, ELogLevel.ERROR, ELogLevel.OFF]

const LEVEL_OF: Record<'trace' | 'info' | 'warn' | 'error', ELogLevel> = {
    trace: ELogLevel.TRACE,
    info: ELogLevel.INFO,
    warn: ELogLevel.WARN,
    error: ELogLevel.ERROR
}

/**
 * What the front end needs in order to draw the dialog: the components with a name a person can read.
 * It is published instead of exporting the enum because moving 'ELogComponent' to common would mean
 * rewriting the import of 47 files here, and would leave two lists to keep in step.
 */
export const logComponentCatalog = (): ILogComponentInfo[] => {
    const ids = (component: ELogComponent): string[] => [...(knownIds[component] ?? [])].sort()
    return [
        { id: ELogComponent.CORE, label: 'Core', description: 'Startup, extensions, API and everything the core does on its own account', ids: ids(ELogComponent.CORE) },
        { id: ELogComponent.CHANNEL, label: 'Channels', description: 'What the installed plugins write', ids: ids(ELogComponent.CHANNEL) },
        { id: ELogComponent.PROVIDER, label: 'Providers', description: 'What the producers write, each under its own id', ids: ids(ELogComponent.PROVIDER) },
        { id: ELogComponent.SENDER, label: 'Senders', description: 'Deliveries to external destinations', ids: ids(ELogComponent.SENDER) },
        { id: ELogComponent.AUTH, label: 'Authentication', description: 'Logins, IdP connectors and access keys', ids: ids(ELogComponent.AUTH) },
        { id: ELogComponent.STORAGE, label: 'Storage', description: 'ConfigMaps, Secrets and the file store', ids: ids(ELogComponent.STORAGE) }
    ]
}

/**
 * Applies the stored settings. Called at startup and on every PUT of the settings, so a change takes
 * effect without restarting: the log is precisely what one wants to turn up while something is going
 * wrong, and a restart would take away the problem being diagnosed.
 */
export const applyLogSettings = (settings?: IKwirthLogSettings): void => {
    levels = { ...DEFAULT_LEVELS }
    for (const [key, level] of Object.entries(settings?.levels ?? {})) {
        /*
            What is not a known level, or does not belong to a known component, is ignored: the settings
            are a JSON file that can be edited by hand, and an odd entry must not leave the log in an
            unknown state.

            ⚠️ The check is on the part BEFORE the colon, not on the whole key. Checking the whole key
            threw away every per-id override — 'chan:excubitor' is not one of the six components — so they
            were dropped here and the filter never saw one. Silently, which is the worst way: the dialog
            stored the level, showed it back, and the channel went on writing at its component's level.
        */
        if (!SEVERITY.includes(level)) continue
        if (!(key.split(':')[0] in DEFAULT_LEVELS)) continue
        ;(levels as Record<string, ELogLevel>)[key] = level
    }
    if (settings?.ansi !== undefined) ansiLog = settings.ansi
}

/** The levels in force, for the GET of the settings to return what actually rules. */
export const currentLogSettings = (): IKwirthLogSettings => ({ levels: { ...levels }, ansi: ansiLog })

const colors = {
  reset: '\x1b[0m',
  info: '\x1b[36m',
  trace: '\x1b[32m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  component: '\x1b[35m',
  gray: '\x1b[90m'
} as const

/*
    Four letters each, like the component tags, so both columns line up and the message always starts
    at the same place. 'TRACE' and 'ERROR' are the only ones that did not already fit.
*/
const LEVEL_LABEL = {
    trace: 'TRCE',
    info: 'INFO',
    warn: 'WARN',
    error: 'ERRO'
} as const

const logGeneric = (
        level: 'trace' | 'info' | 'warn' | 'error',
        color: string,
        component: ELogComponent,
        message: any,
        // Who is writing, when it is known: it is what lets one channel be turned up without touching the rest.
        id?: string
    ): void => {

    /*
        An error is NEVER silenced, whatever its component is set to — not even at 'off'. It was already
        so before this was configurable, and it is what keeps the filter honest: it is here to lower the
        noise, not to hide a failure that nobody then finds out about.
    */
    // The id's own level wins over its component's, when it has one set.
    const threshold = (id !== undefined ? (levels as Record<string, ELogLevel>)[overrideKey(component, id)] : undefined)
        ?? levels[component] ?? ELogLevel.INFO
    if (level !== 'error' && SEVERITY.indexOf(LEVEL_OF[level]) < SEVERITY.indexOf(threshold)) return

    const timestamp = new Date().toLocaleTimeString(undefined, { hour12: false})
    const label = LEVEL_LABEL[level]
    
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
    // Noted down so the dialog can offer it: this runs when a channel, provider or sender starts, so what
    // is collected is exactly what can write.
    ;(knownIds[component] ??= new Set()).add(id)
    return {
        info: (message: unknown) => logGeneric('info', colors.info, component, prefixed(message), id),
        trace: (message: unknown) => logGeneric('trace', colors.trace, component, prefixed(message), id),
        warning: (message: unknown) => logGeneric('warn', colors.warning, component, prefixed(message), id),
        error: (message: unknown) => logGeneric('error', colors.error, component, prefixed(message), id)
    }
}

/** Shorthand for the common case: a provider logging under its own id. */
export const providerLogger = (providerId: string): IComponentLogger => componentLogger(ELogComponent.PROVIDER, providerId)

export const setLogConfig = (ansi:boolean) => {
    ansiLog = ansi
}