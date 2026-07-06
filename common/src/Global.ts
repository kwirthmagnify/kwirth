import { AccessKey } from "./AccessKey"

interface IUser {
    id: string
    name: string
    password: string
    accessKey: AccessKey
    resources: string
    idp?: string        // instanceId del IdP al que esta atado el usuario; vacio/undefined = usuario local kwirth
}

interface ILoginResponse {
    id: string
    name: string
    accessKey: AccessKey
}

// Subset SEGURO de IUser expuesto a los plugins/consumidores (nunca password/accessKey/resources).
// Lo devuelve IBackChannelObject.getUsers(). Suficiente para display y referencia de owner.
interface IUserInfo {
    id: string
    name: string
    idp?: string
}

interface IClusterMetricsConfig {
    metricsInterval: number
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig }