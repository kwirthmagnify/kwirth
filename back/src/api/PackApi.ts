import { Router, Request, Response, raw } from 'express'
import { PackManager, IPackMeta, IPackExtensionRef } from '../tools/PackManager'
import { PluginManager } from '../tools/PluginManager'
import { ProviderManager } from '../tools/ProviderManager'
import { SenderManager } from '../tools/SenderManager'
import { ThemeManager } from '../tools/ThemeManager'
import { HomepageManager } from '../tools/HomepageManager'
import { IdpManager } from '../tools/IdpManager'
import { LoginManager } from '../tools/LoginManager'
import { DocsManager } from '../tools/DocsManager'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { TChannelConstructor } from '../channels/IChannel'
import { TProviderConstructor } from '../providers/IProvider'
import { validateExtensionDeps, IInstalledIndex } from '../tools/ExtensionDeps'
import tar from 'tar'
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'

interface IPackApiDeps {
    packManager: PackManager
    pluginManager: PluginManager
    providerManager: ProviderManager
    senderManager: SenderManager
    themeManager: ThemeManager
    homepageManager: HomepageManager
    idpManager: IdpManager
    loginManager: LoginManager
    docsManager: DocsManager
    apiKeyApi: ApiKeyApi
    registeredChannels: Map<string, TChannelConstructor>
    registeredProviders: Map<string, TProviderConstructor>
}

export class PackApi {
    router: Router
    private deps: IPackApiDeps

    constructor(deps: IPackApiDeps) {
        this.deps = deps
        this.router = Router()
        this.addRoutes()
    }

    private downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proto = url.startsWith('https') ? https : http
            const file = fs.createWriteStream(dest)
            proto.get(url, res => {
                res.pipe(file)
                file.on('finish', () => file.close(() => resolve()))
            }).on('error', err => { fs.unlink(dest, () => {}); reject(err) })
        })
    }

    private async readPkgFromMemberTgz(tgzPath: string): Promise<Record<string, unknown>> {
        const peekDir = path.join(os.tmpdir(), `kwirth-pack-peek-${Date.now()}`)
        fs.mkdirSync(peekDir, { recursive: true })
        try {
            await tar.x({ file: tgzPath, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
            const candidates = [path.join(peekDir, 'package.json'), path.join(peekDir, 'package', 'package.json')]
            const found = candidates.find(p => fs.existsSync(p))
            if (!found) return {}
            return JSON.parse(fs.readFileSync(found, 'utf-8'))
        }
        finally {
            fs.rmSync(peekDir, { recursive: true, force: true })
        }
    }

    private async installFromTgz(tgzPath: string, installedFrom: string): Promise<IPackMeta> {
        const { packManager, pluginManager, providerManager, senderManager, themeManager, homepageManager, idpManager, loginManager, docsManager, registeredChannels, registeredProviders } = this.deps
        const extractDir = path.join(os.tmpdir(), `kwirth-pack-extract-${Date.now()}`)
        fs.mkdirSync(extractDir, { recursive: true })
        try {
            await tar.x({ file: tgzPath, cwd: extractDir })

            // read package.json
            const pkgPath = [path.join(extractDir, 'package.json'), path.join(extractDir, 'package', 'package.json')].find(p => fs.existsSync(p))
            if (!pkgPath) throw new Error('Invalid pack: missing package.json')
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
            if (pkg.extensionType !== EExtensionType.PACK) throw new Error(`Invalid pack: extensionType must be 'pack', got '${pkg.extensionType}'`)
            const packId: string = pkg.id ?? pkg.name?.split('/').pop()
            if (!packId) throw new Error('Invalid pack: missing id')

            // read pack.json
            const packJsonPath = [path.join(extractDir, 'pack.json'), path.join(extractDir, 'package', 'pack.json')].find(p => fs.existsSync(p))
            if (!packJsonPath) throw new Error('Invalid pack: missing pack.json')
            const packJson = JSON.parse(fs.readFileSync(packJsonPath, 'utf-8'))
            const extensions: IPackExtensionRef[] = packJson.extensions ?? []
            if (!extensions.length) throw new Error('Invalid pack: no extensions listed in pack.json')

            // check pack not already installed
            if (await packManager.isInstalled(packId)) throw new Error(`Pack '${packId}' is already installed`)

            // check no member extension is already installed (including dev)
            const [installedPlugins, installedProviders, installedSenders, installedThemes, installedHomepages, installedIdps, installedLogins, installedDocs] = await Promise.all([
                pluginManager.listInstalled(),
                providerManager.listInstalled(),
                senderManager.listInstalled(),
                themeManager.listInstalled(),
                homepageManager.listInstalled(),
                idpManager.listInstalledMeta(),
                loginManager.listInstalled(),
                docsManager.listInstalled()
            ])

            for (const ext of extensions) {
                let exists = false
                switch (ext.extensionType) {
                    case EExtensionType.PLUGIN:   exists = installedPlugins.some(p => p.id === ext.id); break
                    case EExtensionType.PROVIDER:  exists = installedProviders.some(p => p.id === ext.id); break
                    case EExtensionType.SENDER:    exists = installedSenders.some(p => p.id === ext.id); break
                    case EExtensionType.THEME:     exists = installedThemes.some(p => p.id === ext.id); break
                    case EExtensionType.HOMEPAGE:  exists = installedHomepages.some(p => p.id === ext.id); break
                    case EExtensionType.IDP:       exists = installedIdps.some(p => p.id === ext.id); break
                    case EExtensionType.LOGIN:     exists = installedLogins.some(p => p.id === ext.id); break
                    case EExtensionType.DOCS:      exists = installedDocs.some(p => p.id === ext.id && p.targetType === ext.targetType); break
                    default: throw new Error(`Unsupported extension type in pack: '${ext.extensionType}'`)
                }
                if (exists) throw new Error(`Cannot install pack: extension '${ext.extensionType}:${ext.id}' is already installed`)
            }

            // validate requiresExtension for all members before installing any
            const baseDir = fs.existsSync(path.join(extractDir, 'package')) ? path.join(extractDir, 'package') : extractDir
            const installedIndex: IInstalledIndex = {
                plugin:   installedPlugins.map(p => ({ id: p.id, version: p.version })),
                provider: installedProviders.map(p => ({ id: p.id, version: p.version })),
                sender:   installedSenders.map(p => ({ id: p.id, version: p.version })),
                theme:    installedThemes.map(p => ({ id: p.id, version: p.version })),
                homepage: installedHomepages.map(p => ({ id: p.id, version: p.version })),
                idp:      installedIdps.map(p => ({ id: p.id, version: p.version })),
                login:    installedLogins.map(p => ({ id: p.id, version: p.version }))
            }
            const allDepErrors: string[] = []
            let packRequiresRestart = false
            for (const ext of extensions) {
                const memberTgzPath = path.join(baseDir, ext.tgz)
                if (!fs.existsSync(memberTgzPath)) continue
                const memberPkg = await this.readPkgFromMemberTgz(memberTgzPath)
                if (memberPkg.requiresRestart) packRequiresRestart = true
                const depErrors = validateExtensionDeps((memberPkg.requiresExtension as string[] | undefined) ?? [], installedIndex)
                if (depErrors.length) allDepErrors.push(...depErrors.map(e => `[${ext.extensionType}:${ext.id}] ${e}`))
            }
            if (allDepErrors.length) throw new Error(`Pack '${packId}' has unmet dependencies:\n${allDepErrors.join('\n')}`)

            // install each member
            const packInstalledFrom = `pack:${packId}`
            for (const ext of extensions) {
                const memberTgzPath = path.join(baseDir, ext.tgz)
                if (!fs.existsSync(memberTgzPath)) throw new Error(`Pack member tgz not found: ${ext.tgz}`)
                const tmpMemberTgz = path.join(os.tmpdir(), `kwirth-pack-member-${packId}-${ext.id}-${Date.now()}.tgz`)
                fs.copyFileSync(memberTgzPath, tmpMemberTgz)
                try {
                    switch (ext.extensionType) {
                        case EExtensionType.PLUGIN:   await pluginManager.install(tmpMemberTgz, registeredChannels, packInstalledFrom); break
                        case EExtensionType.PROVIDER:  await providerManager.install(tmpMemberTgz, registeredProviders, packInstalledFrom); break
                        case EExtensionType.SENDER:    await senderManager.install(tmpMemberTgz, packInstalledFrom); break
                        case EExtensionType.THEME:     await themeManager.install(tmpMemberTgz, packInstalledFrom); break
                        case EExtensionType.HOMEPAGE:  await homepageManager.install(tmpMemberTgz, packInstalledFrom); break
                        case EExtensionType.IDP:       await idpManager.install(tmpMemberTgz, packInstalledFrom); break
                        case EExtensionType.LOGIN:     await loginManager.install(tmpMemberTgz, packInstalledFrom); break
                        case EExtensionType.DOCS:      await docsManager.install(tmpMemberTgz, packInstalledFrom); break
                    }
                    logInfo(ELogComponent.CORE, `Pack '${packId}': installed ${ext.extensionType} '${ext.id}'`)
                }
                finally {
                    if (fs.existsSync(tmpMemberTgz)) fs.rmSync(tmpMemberTgz)
                }
            }

            const meta: IPackMeta = {
                id: packId,
                displayName: pkg.displayName ?? packId,
                version: pkg.version ?? '0.0.0',
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom,
                extensions,
                requiresRestart: packRequiresRestart
            }
            await packManager.savePack(meta)
            return meta
        }
        finally {
            fs.rmSync(extractDir, { recursive: true, force: true })
        }
    }

    private async uninstallPack(id: string): Promise<void> {
        const { packManager, pluginManager, providerManager, senderManager, themeManager, homepageManager, idpManager, loginManager, docsManager, registeredChannels, registeredProviders } = this.deps
        const meta = await packManager.getPackMeta(id)
        if (!meta) throw new Error(`Pack '${id}' is not installed`)
        for (const ext of meta.extensions) {
            try {
                switch (ext.extensionType) {
                    case EExtensionType.PLUGIN:   await pluginManager.uninstallFromPack(ext.id, registeredChannels); break
                    case EExtensionType.PROVIDER:  await providerManager.uninstallFromPack(ext.id, registeredProviders); break
                    case EExtensionType.SENDER:    await senderManager.uninstallFromPack(ext.id); break
                    case EExtensionType.THEME:     await themeManager.uninstallFromPack(ext.id); break
                    case EExtensionType.HOMEPAGE:  await homepageManager.uninstallFromPack(ext.id); break
                    case EExtensionType.IDP:       await idpManager.uninstallFromPack(ext.id); break
                    case EExtensionType.LOGIN:     await loginManager.uninstallFromPack(ext.id); break
                    case EExtensionType.DOCS:      await docsManager.uninstallFromPack(ext.targetType ?? '', ext.id); break
                }
                logInfo(ELogComponent.CORE, `Pack '${id}': uninstalled ${ext.extensionType} '${ext.id}'`)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Pack '${id}': failed to uninstall ${ext.extensionType} '${ext.id}': ${err}`)
            }
        }
        await packManager.removePack(id)
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.deps.packManager.listInstalled())
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.deps.apiKeyApi))) return
            const { url } = req.body
            if (!url) return void res.status(400).json({ error: 'url required' })
            const tmpTgz = path.join(os.tmpdir(), `kwirth-pack-dl-${Date.now()}.tgz`)
            try {
                await this.downloadFile(url, tmpTgz)
                const meta = await this.installFromTgz(tmpTgz, url)
                logInfo(ELogComponent.CORE, `Pack installed via URL: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Pack install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
            finally {
                if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '200mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.deps.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            const tmpTgz = path.join(os.tmpdir(), `kwirth-pack-upload-${Date.now()}.tgz`)
            try {
                fs.writeFileSync(tmpTgz, req.body)
                const meta = await this.installFromTgz(tmpTgz, 'local')
                logInfo(ELogComponent.CORE, `Pack installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Pack upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
            finally {
                if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.deps.apiKeyApi))) return
            try {
                await this.uninstallPack(req.params.id)
                res.json({ ok: true })
            }
            catch (err) {
                logError(ELogComponent.CORE, `Pack uninstall error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
