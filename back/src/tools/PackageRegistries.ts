import { IPackageRegistry, EPackageRegistryAuthType } from '@kwirthmagnify/kwirth-common'
import { SettingsApi } from '../api/SettingsApi'
import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'

// Where packages are downloaded from is NOT the marketplace: the manifest merely lists them, and each
// entry's url can point anywhere. The public marketplace already proves it — manifests on GitHub, tarballs
// on npmjs. So the download credentials are chosen by matching the tarball's URL against the configured
// registries.

// Normalises for comparison: no trailing slash, the host in lower case. The path IS case sensitive — the
// Nexus repo is called '031-299-IriaOperae' and it is not the same written any other way.
const normalize = (url: string): string => {
    const trimmed = url.trim().replace(/\/+$/, '')
    try {
        const u = new URL(trimmed)
        return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
    }
    catch { return trimmed }
}

// The registry serving this URL. The LONGEST matching prefix wins, so that a specific rule
// ('.../repository/private') can beat a general one ('https://nexus.example'). Disabled ones do not count:
// switching a registry off has to stop injecting its credential, not merely hide it.
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

// The header that applies according to the type. A registry with no credentials adds none.
//
// ⚠️ Bearer and Basic are NOT interchangeable even though the token looks like an encoded credential:
// against Nexus's npm endpoint, the same user token gives a 200 as Bearer and a 401 as Basic.
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

// The eight managers that install extensions only receive configMaps in their constructor, so rather than
// threading settings and secrets through eight constructors this is configured once at startup.
interface IRegistryDeps {
    configMaps: IConfigMaps
    secrets: ISecrets
}
let deps: IRegistryDeps|undefined

export const configurePackageRegistries = (configMaps: IConfigMaps, secrets: ISecrets): void => {
    deps = { configMaps, secrets }
}

// The headers a tarball is downloaded with. With no matching registry, or no credentials, it is downloaded
// anonymously: most packages are public.
//
// The settings are re-read on every download on purpose: downloads are few and sporadic, and this way
// changing the credential in the UI takes effect without restarting the core or invalidating any cache.
export const packageHeaders = async (url: string): Promise<THeaders> => {
    if (!deps) return {}
    const settings = await SettingsApi.read(deps.configMaps)
    const registry = matchRegistry(url, settings.packageRegistries ?? [])
    if (!registry?.auth || registry.auth.type === EPackageRegistryAuthType.NONE) return {}
    return authHeader(registry.auth, await SettingsApi.getRegistryPassword(deps.secrets, registry.id))
}

// Downloads a file following redirects. It used to live copied eight times, one per manager, and none of
// them sent credentials.
//
// ⚠️ Authentication headers do NOT cross to another host. A Nexus answers the download with a redirect to a
// storage with a presigned URL: forwarding the Authorization there would leak the credential to a third
// party and, on top of that, usually breaks the request, because those endpoints reject double authentication.
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

// Reads a file from an already extracted tarball, looking in BOTH places where it can be: a tgz made with
// `npm publish` puts everything inside 'package/', and the ones we build by hand (docs, logins) carry the
// entries at the root.
//
// ⚠️ Every manager's install() already tried both paths, but the RECOVERY did not, and that is where it
// hurts: a back.js that does not fit in the ConfigMap is not stored, so it is downloaded from the origin
// again ON EVERY STARTUP. Looking only at the root, the extension installs fine and disappears on the
// first restart. The 'trivy' provider (a 15.8 MB bundle) gave it away with an ENOENT on
// /tmp/kwirth-provider-trivy-src-*/back.js.
/*
    A /tmp cache of the js downloaded from the origin.

    A back end that does not fit in the ConfigMap is not stored, so it has to be downloaded again. Without
    a cache that is a whole tarball PER STARTUP (914 KB in the 'trivy' provider) and, should the registry
    not answer at that very moment, the extension does not load.

    ⚠️ And it has to be INVALIDATED on installing and on uninstalling. The cache does not carry the version
    in its name — on purpose, because whoever reads it at startup only knows the id — so without deleting
    it an update would go on loading the OLD back end as long as the pod stays alive, and /tmp survives a
    restart of the process.
*/
const CACHEABLE_FILES = ['back.js', 'front.js']

export const cachedExtensionFile = (kind: string, id: string, filename: string): string =>
    path.join(os.tmpdir(), `kwirth-${kind}-${id}-${filename}`)

export const dropCachedExtensionFiles = (kind: string, id: string): void => {
    for (const filename of CACHEABLE_FILES) {
        try { fs.rmSync(cachedExtensionFile(kind, id, filename), { force: true }) }
        catch { /* que no se pueda borrar no puede romper una instalacion */ }
    }
}

export const readTarballFile = (extractDir: string, filename: string): string|undefined => {
    const found = [path.join(extractDir, filename), path.join(extractDir, 'package', filename)]
        .find(candidate => fs.existsSync(candidate))
    return found ? fs.readFileSync(found, 'utf-8') : undefined
}
