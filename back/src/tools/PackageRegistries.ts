import { IPackageRegistry, EPackageRegistryAuthType } from '@kwirthmagnify/kwirth-common'
import { SettingsApi } from '../api/SettingsApi'
import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import fs from 'fs'
import https from 'https'
import http from 'http'

// De donde se bajan los paquetes NO es el marketplace: el manifest solo los lista, y la url de cada
// entrada puede apuntar a cualquier sitio. El marketplace publico ya lo demuestra — manifests en GitHub,
// tarballs en npmjs. Asi que las credenciales de descarga se eligen casando la URL del tarball contra
// los registros configurados.

// Normaliza para comparar: sin barra final, host en minusculas. La ruta SI distingue mayusculas — el
// repo del Nexus se llama '031-299-IriaOperae' y no es lo mismo escrito de otra forma.
const normalize = (url: string): string => {
    const trimmed = url.trim().replace(/\/+$/, '')
    try {
        const u = new URL(trimmed)
        return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
    }
    catch { return trimmed }
}

// El registro que sirve esta URL. Gana el prefijo MAS LARGO que case, para que una regla especifica
// ('.../repository/privado') pueda ganarle a una general ('https://nexus.example'). Los deshabilitados
// no cuentan: apagar un registro tiene que dejar de inyectar su credencial, no solo ocultarlo.
export const matchRegistry = (url: string, registries: IPackageRegistry[]): IPackageRegistry|undefined => {
    const target = normalize(url)
    let best: IPackageRegistry|undefined
    let bestLength = -1
    for (const r of registries) {
        if (!r.enabled) continue
        const prefix = normalize(r.url)
        if (target !== prefix && !target.startsWith(prefix + '/')) continue
        if (prefix.length > bestLength) { best = r; bestLength = prefix.length }
    }
    return best
}

export type THeaders = Record<string, string>

export const basicHeader = (username: string|undefined, password: string|undefined): THeaders =>
    ({ Authorization: `Basic ${Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64')}` })

export const bearerHeader = (token: string|undefined): THeaders =>
    ({ Authorization: `Bearer ${token ?? ''}` })

// La cabecera que toca segun el tipo. Un registro sin credenciales no añade ninguna.
//
// ⚠️ Bearer y Basic NO son intercambiables aunque el token parezca una credencial codificada: contra el
// endpoint npm del Nexus, el mismo user token da 200 como Bearer y 401 como Basic.
export const authHeader = (auth: IPackageRegistry['auth'], secret: string|undefined): THeaders => {
    switch (auth?.type) {
        case EPackageRegistryAuthType.BASIC:
            return basicHeader(auth.username, secret)
        case EPackageRegistryAuthType.BEARER:
            return bearerHeader(secret)
        default:
            return {}
    }
}

// Los ocho managers que instalan extensiones solo reciben configMaps en su constructor, asi que en vez
// de enhebrar settings y secretos por ocho constructores se configura esto una vez al arrancar.
interface IRegistryDeps {
    configMaps: IConfigMaps
    secrets: ISecrets
}
let deps: IRegistryDeps|undefined

export const configurePackageRegistries = (configMaps: IConfigMaps, secrets: ISecrets): void => {
    deps = { configMaps, secrets }
}

// Cabeceras con las que bajar un tarball. Sin registro que case, o sin credenciales, se baja anonimo:
// la mayoria de los paquetes son publicos.
//
// Los settings se releen en cada descarga a proposito: son pocas y esporadicas, y asi cambiar la
// credencial en la UI surte efecto sin reiniciar el core ni invalidar cache alguna.
export const packageHeaders = async (url: string): Promise<THeaders> => {
    if (!deps) return {}
    const settings = await SettingsApi.read(deps.configMaps)
    const registry = matchRegistry(url, settings.packageRegistries ?? [])
    if (!registry?.auth || registry.auth.type === EPackageRegistryAuthType.NONE) return {}
    return authHeader(registry.auth, await SettingsApi.getRegistryPassword(deps.secrets, registry.id))
}

// Descarga un fichero siguiendo redirects. Antes vivia copiada ocho veces, una por manager, y ninguna
// mandaba credenciales.
//
// ⚠️ Las cabeceras de autenticacion NO cruzan a otro host. Un Nexus responde a la descarga con un
// redirect a un almacenamiento con URL prefirmada: reenviar ahi el Authorization filtraria la credencial
// a un tercero y ademas suele romper la peticion, porque esos endpoints rechazan la doble autenticacion.
export const downloadFile = (url: string, destPath: string, headers: THeaders = {}): Promise<void> => {
    const download = (current: string, carried: THeaders, hops: number): Promise<void> => new Promise((resolve, reject) => {
        if (hops > 5) { reject(new Error(`Too many redirects downloading ${url}`)); return }
        const protocol = current.startsWith('https') ? https : http
        const file = fs.createWriteStream(destPath)
        const cleanup = (): void => { file.close(); fs.rm(destPath, { force: true }, () => {}) }

        protocol.get(current, { headers: { 'User-Agent': 'kwirth/1.0', ...carried } }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close()
                const next = new URL(res.headers.location, current).toString()
                const sameHost = new URL(next).host.toLowerCase() === new URL(current).host.toLowerCase()
                download(next, sameHost ? carried : {}, hops + 1).then(resolve).catch(reject)
                return
            }
            if (res.statusCode && res.statusCode !== 200) {
                cleanup()
                reject(new Error(`HTTP ${res.statusCode} downloading ${current}`))
                return
            }
            res.pipe(file)
            file.on('finish', () => { file.close(); resolve() })
        }).on('error', err => { cleanup(); reject(err) })
    })
    return download(url, headers, 0)
}
