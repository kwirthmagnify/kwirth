import { IInstanceMessage, IExtensionScope } from "@kwirthmagnify/kwirth-common"

// ─── Scopes de autorización (RBAC propio de Ops) ──────────────────────────────
// Namespaced con 'ops$' (convención del proyecto). Definen la escalera de acceso del canal.
// Solo se declaran los scopes REALMENTE enforced por el canal: GET (describe/get) y RESTART
// (restart/restartpod/restartns). La shell interactiva no está gateada hoy (no hay ops$shell/execute).
export enum EOpsScope {
    GET = 'ops$get',            // ver/describir recursos
    RESTART = 'ops$restart'     // reiniciar workloads (pods, contenedores, deployments)
}

// Catálogo de scopes que Ops declara (lo expone el canal vía getScopeCatalog() en front y back);
// pobla el editor de seguridad (User/API) y sirve para validar permisos. Labels/descriptions en inglés.
export const OPS_SCOPES: IExtensionScope[] = [
    { scope: EOpsScope.GET,     label: 'Ops · Get',     description: 'View and describe resources' },
    { scope: EOpsScope.RESTART, label: 'Ops · Restart', description: 'Restart workloads (pods, containers, deployments)' }
]

export enum EOpsCommand {
    DESCRIBE = 'describe',
    //EXECUTE = 'execute',
    RESTART = 'restart',
    RESTARTPOD = 'restartpod',
    RESTARTNS = 'restartns'
}

export interface IOpsMessage extends IInstanceMessage {
    msgtype: 'opsmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EOpsCommand
    params?: string[]
}

export interface IOpsMessageResponse extends IInstanceMessage {
    msgtype: 'opsmessageresponse'
    id: string
    command: EOpsCommand
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}

export interface IOpsInstanceConfig {
    sessionKeepAlive: boolean
}
