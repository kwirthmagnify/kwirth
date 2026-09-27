/*
    What the core's log writes, and how much of it.

    The LEVEL lives here because it travels in the settings: the front end sends it and the back end
    applies it. The list of COMPONENTS does not: the back end publishes it through
    GET /core/settings/log/components, the same way it already publishes the RBAC scope catalogue. The
    alternative was moving 'ELogComponent' to common and rewriting the import of 47 back end files, which
    is a lot of blast radius for a dropdown — and it would leave two lists to keep in step, which is
    exactly the bug this avoids.
*/

/*
    The minimum a component writes. They are ordered from most to least talkative, and 'off' closes the
    tap — except for errors, which are never silenced: a filter is there to lower the noise, not to hide a
    failure that nobody then knows about.
*/
export enum ELogLevel {
    TRACE = 'trace',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    OFF = 'off'
}

/** How talkative each component is. What is not named keeps the core's default. */
export interface IKwirthLogSettings {
    /*
        Component id ('core', 'prov', …) → its minimum level. The back end publishes the valid ids.

        A key can also name ONE writer, as '<component>:<id>' ('chan:excubitor'), and then it beats its
        component's level: turning one channel up to trace without drowning in the rest is the normal way
        of debugging a plugin. They share this map because the settings are flat JSON, and the colon tells
        them apart — no component id carries one.
    */
    levels?: Record<string, ELogLevel>
    /*
        ANSI colours in the output. They help on a terminal and get in the way anywhere else: collected
        into a file or forwarded to a log service, the escape sequences travel as rubbish in the middle of
        the message. It could already be set through the ANSILOG variable; what it could not do was
        survive a restart, which is what storing it here adds.
    */
    ansi?: boolean
}

/** A component as the back end publishes it, so the front end can draw it without knowing the enum. */
export interface ILogComponentInfo {
    /** The value that travels in 'levels' and is printed in the tag ('core', 'prov', …). */
    id: string
    /** What to call it on screen. */
    label: string
    description: string
    /*
        Who writes under this component ('excubitor', 'metrics', …), so each can be given a level of its
        own. The back end collects them as the loggers are created, so what is offered is what can really
        write — not a list kept by hand that drifts from reality.
    */
    ids?: string[]
}
