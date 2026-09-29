import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType } from './BundledExtensions'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { downloadFile, packageHeaders } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'

export interface IDocsMeta {
    id: string
    targetType: string
    // 'name' is the PACKAGE's name and 'displayName' the human one, as in the other ten types. While the
    // docs were only loaded from dev, the tgz put the human name in 'name' and nobody noticed what was
    // missing; published to a registry, 'name' is the npm scope and the one that gets drawn is 'displayName'.
    name: string
    displayName?: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
}

// What is surplus in the index when kwirth-dev.json is re-read. Only what is marked 'dev' is reconciled:
// what is bundled, what comes from a pack and what was installed from a marketplace, a URL or a file stays
// where it is.
//
// The identity of a set of docs is the pair (targetType, id), but the dev file's key is only a label. So
// the entry is saved when it has just been installed, or when its id matches a declared label — the latter
// covers the declared ones that cannot be installed today for not having been built.
export const staleDevDocs = (index: IDocsMeta[], declaredLabels: Set<string>, installedPairs: Set<string>): IDocsMeta[] =>
    index.filter(d => d.installedFrom === 'dev'
        && !installedPairs.has(`${d.targetType}/${d.id}`)
        && !declaredLabels.has(d.id))

export class DocsManager {
    private configMaps: IConfigMaps
    private cachedIndex: IDocsMeta[] = []
    private docsPath: string

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
        this.docsPath = process.env.KWIRTH_DOCS_PATH || path.join(os.tmpdir(), 'kwirth-docs')
        fs.mkdirSync(this.docsPath, { recursive: true })
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]
        this.cachedIndex = index || []
    }

    getDocsDir(targetType: string, id: string): string | undefined {
        const dir = path.join(this.docsPath, targetType, id)
        return fs.existsSync(dir) ? dir : undefined
    }

    async listInstalled(): Promise<IDocsMeta[]> {
        return (await this.configMaps.read('kwirth-docs-index', [])) as IDocsMeta[] || []
    }

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IDocsMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-${Date.now()}.tgz`)
        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            }
            else {
                await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
            }

            const peekDir = path.join(os.tmpdir(), `kwirth-docs-peek-${Date.now()}`)
            fs.mkdirSync(peekDir, { recursive: true })
            try {
                await tar.x({ file: tmpTgz, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
                let metaPath = path.join(peekDir, 'package.json')
                let stripLevel = 0
                if (!fs.existsSync(metaPath)) {
                    metaPath = path.join(peekDir, 'package', 'package.json')
                    stripLevel = 1
                }
                if (!fs.existsSync(metaPath)) throw new Error('Invalid docs bundle: missing package.json')
                const meta: IDocsMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                if (!meta.targetType) throw new Error(`Invalid docs bundle: missing targetType in package.json`)

                const index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
                // The identity of a set of docs is the pair (targetType, id), not the id alone.
                // Its destination folder is deleted whole before extracting, so there are no orphans to
                // clean up here: what stays on disk is exactly what the package carries.
                if (installedFrom !== 'bundled' && installedFrom !== 'dev')
                    assertInstallable('Docs', `${meta.targetType}/${meta.id}`, index.find(d => d.targetType === meta.targetType && d.id === meta.id), meta.version, upgrade)

                const destDir = path.join(this.docsPath, meta.targetType, meta.id)
                if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
                fs.mkdirSync(destDir, { recursive: true })
                await tar.x({ file: tmpTgz, cwd: destDir, strip: stripLevel })

                meta.installedFrom = installedFrom ?? tarGzUrl

                meta.marketplaceId = marketplaceId

                meta.marketplaceLabel = marketplaceLabel
                const updatedIndex = [...index.filter(d => !(d.targetType === meta.targetType && d.id === meta.id)), meta]
                await this.configMaps.write('kwirth-docs-index', updatedIndex)
                this.cachedIndex = updatedIndex

                logInfo(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
                return meta
            }
            finally {
                fs.rmSync(peekDir, { recursive: true, force: true })
            }
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IDocsMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(targetType: string, id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
        const meta = index.find(d => d.targetType === targetType && d.id === id)
        if (meta?.installedFrom === 'bundled' || meta?.installedFrom === 'dev') throw new Error(`Docs '${targetType}/${id}' is bundled/dev and cannot be uninstalled`)
        await this._doUninstall(targetType, id, index)
    }

    // On uninstalling the pack its members are deleted without going through the bundled/dev guard: the
    // pack owns what it installed.
    async uninstallFromPack(targetType: string, id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
        await this._doUninstall(targetType, id, index)
    }

    private async _doUninstall(targetType: string, id: string, index: IDocsMeta[]): Promise<void> {
        const destDir = path.join(this.docsPath, targetType, id)
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
        const updatedIndex = index.filter(d => !(d.targetType === targetType && d.id === id))
        await this.configMaps.write('kwirth-docs-index', updatedIndex)
        this.cachedIndex = updatedIndex
        logInfo(ELogComponent.CORE, `Docs '${targetType}/${id}' uninstalled`)
    }

    async installBundled(dir: string): Promise<void> {
        // Only the tgz files declaring themselves 'docs'. ALL of those in the shared directory used to be
        // walked and the only defence was install() demanding targetType: a bundled login carried it, so
        // it passed the filter and ended up installed as documentation too, under docsPath/login/<id>.
        for (const filePath of await listBundledOfType(dir, EExtensionType.DOCS)) {
            const file = path.basename(filePath)
            let bundleId: string | undefined
            let bundleTargetType: string | undefined
            let bundleVersion: string | undefined
            try {
                const peekTmp = path.join(os.tmpdir(), `kwirth-docs-bv-${path.basename(file, '.tgz')}`)
                fs.mkdirSync(peekTmp, { recursive: true })
                await tar.x({ file: filePath, cwd: peekTmp, filter: (p: string) => p.endsWith('package.json') })
                const pkgCandidates = [path.join(peekTmp, 'package.json'), path.join(peekTmp, 'package', 'package.json')]
                const pkgPath = pkgCandidates.find(p => fs.existsSync(p))
                if (pkgPath) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
                    bundleId = pkg.id
                    bundleTargetType = pkg.targetType
                    bundleVersion = pkg.version
                }
                fs.rmSync(peekTmp, { recursive: true, force: true })
            }
            catch {}

            const existing = bundleId && bundleTargetType ? this.cachedIndex.find(d => d.targetType === bundleTargetType && d.id === bundleId) : undefined
            const destDir = path.join(this.docsPath, bundleTargetType ?? '', bundleId ?? '')
            if (existing && bundleVersion && existing.version === bundleVersion && fs.existsSync(destDir)) {
                logInfo(ELogComponent.CORE, `Bundled docs '${bundleTargetType}/${bundleId}' v${bundleVersion} up to date — skipping`)
                continue
            }
            /*
                ⚠️ THE INDEX SAYS INSTALLED AND THE FILES ARE NOT THERE.

                The index lives in ConfigMaps, which persists, and the extracted files live in the
                SYSTEM'S TEMPORARY directory, which does not: clean the temp folder and the two stop
                agreeing. Reinstalling here does not fix it by itself, because install() refuses an id
                already in the index ('already installed') and that error is swallowed a few lines below
                as a routine skip — so the guide answers 404 for ever, with nothing saying why.

                The index is the one that is wrong, so its entry is dropped before reinstalling. It is
                not an uninstall: nothing of the user's is lost, since there is nothing on disk to lose.
            */
            if (existing && bundleId && bundleTargetType && !fs.existsSync(destDir)) {
                logWarning(ELogComponent.CORE, `Bundled docs '${bundleTargetType}/${bundleId}' is in the index but its files are gone (temp cleaned?) — reinstalling`)
                await this.uninstallFromPack(bundleTargetType, bundleId)
            }
            try {
                const meta = await this.install(filePath, 'bundled')
                logInfo(ELogComponent.CORE, `Bundled docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
            }
            catch (err: any) {
                if (err?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled docs '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled docs '${file}': ${err}`)
            }
        }
    }

    // Re-downloads and extracts a docs package from its source URL into docsPath.
    // Only runs for URL-installed docs; bundled docs are handled by installBundled().
    // Locally-uploaded docs (installedFrom === 'local') cannot be re-hydrated.
    private async rehydrate(meta: IDocsMeta): Promise<void> {
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logWarning(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' was installed from a local file and cannot be restored — reinstall manually`)
            return
        }
        if (meta.installedFrom === 'bundled') return  // handled by installBundled()
        if (meta.installedFrom === 'dev') return      // handled by loadDevDocs()

        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-rehydrate-${meta.id}.tgz`)
        const peekDir = path.join(os.tmpdir(), `kwirth-docs-rehydrate-peek-${meta.id}`)
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            fs.mkdirSync(peekDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
            const strip = fs.existsSync(path.join(peekDir, 'package.json')) ? 0 : 1
            const destDir = path.join(this.docsPath, meta.targetType, meta.id)
            if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
            fs.mkdirSync(destDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: destDir, strip })
            logInfo(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' v${meta.version} rehydrated from ${meta.installedFrom}`)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to rehydrate docs '${meta.targetType}/${meta.id}': ${err}`)
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
            if (fs.existsSync(peekDir)) fs.rmSync(peekDir, { recursive: true, force: true })
        }
    }

    // kwirth-dev.json is DECLARATIVE: what is listed here stays installed and what is removed from the
    // file gets uninstalled. A set of dev docs is a REAL installation — it enters the index and is deployed
    // under docsPath — so deleting the line merely stopped it being reinstalled: the entry survived and the
    // manager went on considering it installed. And there was no way of removing it from the UI, because
    // uninstall's guard rejects precisely what is marked 'dev'.
    //
    // Only what is marked 'dev' is reconciled. What was installed from a marketplace, a URL, a file or a
    // pack is not touched.
    loadDevDocs(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let entries: [string, unknown][] = []
        try {
            entries = Object.entries(JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).docs ?? {})
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (docs): ${err}`)
            return
        }
        ;(async () => {
            const declaredLabels = new Set<string>()
            const installedPairs = new Set<string>()
            for (const [label, tgzPath] of entries) {
                if (typeof tgzPath !== 'string') continue
                declaredLabels.add(label)
                const resolved = path.resolve(process.cwd(), tgzPath)
                if (!fs.existsSync(resolved)) {
                    logWarning(ELogComponent.CORE, `[dev] Docs '${label}' tgz not found at ${resolved} — run 'npm run build' in back/ first`)
                    continue
                }
                try {
                    const meta = await this.install(resolved, 'dev')
                    installedPairs.add(`${meta.targetType}/${meta.id}`)
                    logInfo(ELogComponent.CORE, `[dev] Docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
                }
                catch (err) {
                    if ((err as Error)?.message?.includes('already installed'))
                        logInfo(ELogComponent.CORE, `[dev] Docs '${label}' already installed — skipping`)
                    else
                        logError(ELogComponent.CORE, `[dev] Failed to install docs '${label}': ${err}`)
                }
            }
            await this.pruneDevDocs(declaredLabels, installedPairs)
        })().catch(err => logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (docs): ${err}`))
    }

    private async pruneDevDocs(declaredLabels: Set<string>, installedPairs: Set<string>): Promise<void> {
        let index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
        for (const meta of staleDevDocs(index, declaredLabels, installedPairs)) {
            await this._doUninstall(meta.targetType, meta.id, index)
            index = index.filter(d => !(d.targetType === meta.targetType && d.id === meta.id))
            logInfo(ELogComponent.CORE, `[dev] Docs '${meta.targetType}/${meta.id}' no longer in kwirth-dev.json — uninstalled`)
        }
    }

    // On startup, re-downloads all URL-installed docs whose filesystem dir is missing.
    // In k8s /tmp is ephemeral so all URL-installed docs need rehydration after restart.
    /**
     * Where the bundled extensions travel. The environment variable in a real deployment; in development
     * nobody sets it, and the bundle is `bundle/` next to the back end's working directory.
     *
     * It is resolved here and not read from the variable alone because of what depended on it: without a
     * value, `installBundled()` simply never ran, and the bundled documentation could not be restored.
     */
    private bundledDocsDir(): string {
        return process.env.BUNDLED_EXTENSIONS_PATH ?? path.resolve(process.cwd(), 'bundle', 'docs')
    }

    /*
        At startup, whatever is in the index but not on disk.

        ⚠️ THE INDEX AND THE FILES LIVE IN DIFFERENT PLACES. The index is in ConfigMaps, which persists;
        the extracted files are in the SYSTEM'S TEMPORARY directory, which does not. Clean the temp folder
        and the core goes on saying the guide is installed while every one of its pages answers 404.

        What made it unrecoverable was that BUNDLED documentation fell between two chairs: `rehydrate()`
        skips it ("installBundled handles it") and `installBundled()` only runs when
        BUNDLED_EXTENSIONS_PATH is set — which in development it is not. So nobody restored it and nobody
        said anything. It happened to the core's own guide on 2026-09-29.
    */
    async loadAll(): Promise<void> {
        let missingBundled = false
        for (const meta of this.cachedIndex) {
            const destDir = path.join(this.docsPath, meta.targetType, meta.id)
            if (fs.existsSync(destDir)) continue
            if (meta.installedFrom === 'bundled') {
                logWarning(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' is bundled and its files are gone (temp cleaned?) — restoring from the bundle`)
                missingBundled = true
                continue
            }
            await this.rehydrate(meta)
        }
        if (!missingBundled) return

        const dir = this.bundledDocsDir()
        if (!fs.existsSync(dir)) {
            // Said out loud rather than left to a 404: the index claims a guide that nobody can serve.
            logError(ELogComponent.CORE, `Bundled docs are missing from disk and the bundle is not at '${dir}' — their pages will answer 404 until they are reinstalled`)
            return
        }
        await this.installBundled(dir)
    }
}
