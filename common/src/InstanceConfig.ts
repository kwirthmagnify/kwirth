import { IInstanceMessage } from "./InstanceMessage"
import { ESignalMessageReason } from "./SignalMessage"

// transient
export enum InstanceConfigObjectEnum {
    PODS = 'pods',
    EVENTS = 'events'
}

// transient
export enum InstanceConfigViewEnum {
    NONE = 'none',
    CLUSTER = 'cluster',
    NAMESPACE = 'namespace',
    GROUP = 'group',
    POD = 'pod',
    CONTAINER = 'container'
}

// transient
export enum InstanceConfigScopeEnum {
    NONE='none',
    API = 'api',
    CLUSTER = 'cluster',

    // LOG
    FILTER = 'filter',
    VIEW = 'view',

    // METRICS
    SNAPSHOT = 'snapshot',
    STREAM = 'stream',

    // ALARM
    CREATE = 'create',
    SUBSCRIBE = 'subscribe',

    // OPS
    GET = 'get',
    EXECUTE = 'execute',
    RESTART = 'restart',

    // TRIVY
    WORKLOAD = "workload",
    KUBERNETES = "kubernetes"
}

export enum EInstanceConfigObject {
    PODS = 'pods',
    EVENTS = 'events'
}

export enum EInstanceConfigView {
    NONE = 'none',
    CLUSTER = 'cluster',
    NAMESPACE = 'namespace',
    GROUP = 'group',
    POD = 'pod',
    CONTAINER = 'container'
}

export enum EInstanceConfigScope {
    NONE='none',
    API = 'api',
    CLUSTER = 'cluster',

    // LOG
    FILTER = 'filter',
    VIEW = 'view',

    // METRICS
    SNAPSHOT = 'snapshot',
    STREAM = 'stream',

    // ALARM
    CREATE = 'create',
    SUBSCRIBE = 'subscribe',

    // OPS
    GET = 'get',
    EXECUTE = 'execute',
    RESTART = 'restart',

    // TRIVY
    WORKLOAD = "workload",
    KUBERNETES = "kubernetes"
}

export interface IInstanceConfig extends IInstanceMessage{
    objects: EInstanceConfigObject
    accessKey: string
    scope: string
    view: EInstanceConfigView
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}

export interface IInstanceConfigResponse extends IInstanceMessage {
    text?: string
    data?: any
    /** Código de protocolo cuando esta respuesta es una NEGATIVA. Ver `ESignalMessageReason`: el texto es
     *  para leerlo, esto es para decidir — y reescribir una frase no puede cambiar lo que hace un par. */
    reason?: ESignalMessageReason
}
