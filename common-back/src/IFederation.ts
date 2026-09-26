import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

// Types for BACK-side multi-cluster federation (back-to-back over WebSocket). They are the back end's
// OWN COPY: the front end has its equivalents in common-front (IClusterEndpoint/ERemoteConnState/... for
// ITS federation, such as Excubitor's landscape view). They are not unified: some channels federate
// through the front end and others through the back, and there is no single way to federate. These live
// here because the back end is what consumes them.

// Endpoint of a remote cluster a back end opens a federated connection to. It comes from the cluster
// list in the user's profile ({name, url, accessString}); the core reads it with readUserStore. 'id'
// (the remote cluster's uid) is optional: it may not be resolved yet.
export interface IClusterEndpoint {
    name: string
    url: string
    accessString: string
    id?: string
}

// State of a remote connection managed by the core. Never string literals.
// Progression as it comes up: DOWN → RECONNECTING (looking for a socket) → HANDSHAKING (socket open,
// asking the remote channel for an instance) → CONNECTED (socket + instance = operational). CONNECTED is
// the ONLY state in which a command actually reaches the remote channel.
export enum ERemoteConnState {
    CONNECTED = 'connected',         // socket open AND a valid instance captured → operational
    HANDSHAKING = 'handshaking',     // socket open but with NO instance yet (remote channel starting / re-handshake)
    RECONNECTING = 'reconnecting',   // no socket, retrying with backoff
    DOWN = 'down'                    // connection closed / never established (terminal or no credentials)
}

// Callbacks the plugin registers to consume ONE remote connection (the singular version: 1 bot = 1 room
// = 1 remote cluster = 1 handle; the plugin opens N connections and keeps N handles). The raw WS is NOT
// exposed.
export interface IRemoteChannelHandlers {
    onMessage: (msg: IInstanceMessage) => void
    onState: (state: ERemoteConnState) => void
}

// Managed handle returned by openRemoteChannel: the raw WS is NOT exposed (it is replaced on reconnect).
export interface IRemoteChannelHandle {
    send: (msg: IInstanceMessage) => void   // routes to the live WS (fills in the instance captured at START)
    close: () => void                       // closes the connection and stops the retries
}
