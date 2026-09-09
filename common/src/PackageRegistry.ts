// Un registro de paquetes es de donde se DESCARGAN los tarballs, y no tiene por que ser el sitio donde
// vive el manifest que los lista. El marketplace publico ya funciona asi: los manifests estan en GitHub
// y los paquetes en npmjs. Por eso esto es una lista aparte de la de marketplaces, y no una propiedad
// suya: un mismo manifest puede listar extensiones alojadas en registros distintos.
//
// Al descargar se elige el registro CASANDO LA URL del tarball contra su `url`, tratada como prefijo.

export enum EPackageRegistryAuthType {
    NONE = 'none',
    BASIC = 'basic',     // Authorization: Basic — usuario y contraseña de la cuenta
    BEARER = 'bearer'    // Authorization: Bearer — un user token opaco
}

// El secreto —contraseña o token, segun el tipo— se trata como cualquier otro dato: viaja al front, se
// pre-rellena enmascarado con ojo para revelar, y se reenvia tal cual al guardar. En reposo lo guarda el
// back en ISecrets (cifrado en filesystem, RBAC en k8s), nunca en el configmap.
//
// ⚠️ El endpoint npm de un Nexus con user tokens NO acepta Basic: verificado contra el servidor real, la
// misma credencial da 200 como Bearer y 401 como Basic. Y el token es OPACO — no es un base64 de
// 'usuario:contraseña', asi que no se puede convertir de un tipo al otro.
export interface IPackageRegistryAuth {
    type: EPackageRegistryAuthType
    // Solo en BASIC
    username?: string
    password?: string
    // Solo en BEARER
    token?: string
}

export interface IPackageRegistry {
    id: string
    label: string
    // PREFIJO de las URLs que sirve este registro, no solo el host: un mismo Nexus aloja varios repos y
    // puede que solo uno pida credenciales. Cuando varios casan, gana el prefijo mas largo, para que una
    // regla especifica pueda ganarle a una general.
    url: string
    enabled: boolean
    auth?: IPackageRegistryAuth
}
