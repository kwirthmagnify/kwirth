import { AccessKey } from "./AccessKey"
import { IMarketplace } from "./Marketplace"

interface IUser {
    id: string
    name: string
    password: string
    accessKey: AccessKey
    resources: string
    idp?: string           // instanceId del IdP al que esta atado el usuario; vacio/undefined = usuario local kwirth
    startChannel?: string  // canal a arrancar en fullscreen al hacer login
    startView?: string     // EInstanceConfigView value para el startChannel (default: 'cluster')
    startNamespace?: string
    startGroup?: string
    startPod?: string
    startContainer?: string
    exitFullScreen?: boolean  // si el usuario puede salir del modo fullscreen
    enabledChannels?: string[]  // lista de canales que el usuario puede lanzar; undefined = todos
}

interface ILoginResponse {
    id: string
    name: string
    accessKey: AccessKey
    startChannel?: string
    exitFullScreen?: boolean
    enabledChannels?: string[]
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

// Configuracion del propio Kwirth, persistida por el back bajo la clave 'kwirth.settings' y
// servida por /core/settings. No confundir con los settings del usuario, que van por /store.
// Todos los campos son opcionales: unos settings guardados antes de que existiera un campo no lo
// tendran, y el back resuelve el valor efectivo con su propia precedencia antes de devolverlos.
interface IKwirthSettings {
    metricsInterval?: number
    marketplaces?: IMarketplace[]
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig, IKwirthSettings }