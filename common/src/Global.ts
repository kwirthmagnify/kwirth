import { AccessKey } from "./AccessKey"
import { IMarketplace } from "./Marketplace"
import { IPackageRegistry } from "./PackageRegistry"

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

// SAFE subset of IUser exposed to plugins and consumers (never password/accessKey/resources).
// Returned by IBackChannelObject.getUsers(). Enough for display and for referencing an owner.
interface IUserInfo {
    id: string
    name: string
    idp?: string
}

interface IClusterMetricsConfig {
    metricsInterval: number
}

// Kwirth's own configuration, persisted by the back end under the key 'kwirth.settings' and served by
// /core/settings. Not to be confused with the user's settings, which go through /store.
// Every field is optional: settings saved before a field existed will not have it, and the back end
// resolves the effective value with its own precedence before returning them.
interface IKwirthSettings {
    metricsInterval?: number
    // Where the manifests are READ from
    marketplaces?: IMarketplace[]
    // Where the packages are DOWNLOADED from, and with which credentials. A separate list because there
    // is no one-to-one relation: one manifest can list tarballs hosted in several different registries.
    packageRegistries?: IPackageRegistry[]
    /*
        Cuantas lineas del log del contenedor ANTERIOR se leen al arrancar (kubernetes, in-cluster).
        1000 por defecto. Es un ajuste porque 1000 es un numero razonable, no una verdad: un core que
        escupe mucho en el arranque necesita mas para que la causa del cierre no se quede fuera de la
        ventana. Lo guardado gana, luego la variable PREVIOUSLOGLINES, luego el default.
    */
    previousLogLines?: number
}

export { ILoginResponse, IUser, IUserInfo, IClusterMetricsConfig, IKwirthSettings }