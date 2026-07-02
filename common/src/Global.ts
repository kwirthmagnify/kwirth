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

interface IClusterMetricsConfig {
    metricsInterval: number
}

export { ILoginResponse, IUser, IClusterMetricsConfig }