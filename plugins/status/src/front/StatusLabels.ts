import { EComponentHealth, EComponentKind } from '../common/StatusTypes'

/*
    How each state and kind is worded, and in what colour. Shared by the tables and the Home boxes, so
    there is one language on the whole screen.

    The text goes here and not in the back end on purpose: the back end reports FACTS (started, router
    mounted) and the front end decides how to tell them. That way, the day a word has to change there is
    no need to republish the back end or restart the server.
*/

export type THealthColor = 'success' | 'warning' | 'error' | 'default'

export interface IHealthLabel {
    label: string
    color: THealthColor
}

export const HEALTH_LABEL: Record<EComponentHealth, IHealthLabel> = {
    [EComponentHealth.ACTIVE]: { label: 'Active', color: 'success' },
    // Idle is NOT an error, it is information: it works, but it is of use to nobody. Hence 'default' and
    // not 'warning' — whoever looks must be able to tell "this needs fixing" from "this is superfluous".
    [EComponentHealth.IDLE]: { label: 'Idle', color: 'default' },
    [EComponentHealth.INSTANTIATED]: { label: 'Running', color: 'success' },
    [EComponentHealth.NOT_INSTANTIATED]: { label: 'Not started', color: 'warning' },
    [EComponentHealth.PENDING_RESTART]: { label: 'Needs restart', color: 'warning' },
    [EComponentHealth.FAILED]: { label: 'Failed', color: 'error' },
    [EComponentHealth.UNKNOWN]: { label: 'Not reported', color: 'default' }
}

export const KIND_LABEL: Record<EComponentKind, string> = {
    [EComponentKind.PROVIDER]: 'Provider',
    [EComponentKind.PLUVIDER]: 'Pluvider',
    [EComponentKind.SENDER]: 'Sender',
    [EComponentKind.WEBHOOK]: 'Webhook',
    [EComponentKind.CHANNEL]: 'Channel'
}

/*
    What needs attention first: the BROKEN, then the SURPLUS (idle: it works, but it is of use to
    nobody), then what does not report, and at the end what is fine. The tables sort by it and the Home
    boxes list their states in this order.

    ⚠️ It is a Record and not an array on purpose: with an array, a state somebody adds and forgets to
    put here returns -1 from indexOf and slips in ABOVE the failures — exactly the opposite of what is
    wanted. With a Record, TypeScript forces a decision about where it goes.
*/
export const HEALTH_ORDER: Record<EComponentHealth, number> = {
    [EComponentHealth.FAILED]: 0,
    [EComponentHealth.PENDING_RESTART]: 1,
    [EComponentHealth.NOT_INSTANTIATED]: 2,
    [EComponentHealth.IDLE]: 3,
    [EComponentHealth.UNKNOWN]: 4,
    [EComponentHealth.INSTANTIATED]: 5,
    [EComponentHealth.ACTIVE]: 6
}

/** The states, in the order they are worth reading. */
export const HEALTH_SEQUENCE: EComponentHealth[] = (Object.keys(HEALTH_ORDER) as EComponentHealth[])
    .sort((a, b) => HEALTH_ORDER[a] - HEALTH_ORDER[b])
