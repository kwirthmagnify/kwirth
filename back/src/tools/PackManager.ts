import { IConfigMaps } from './IConfigMap'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logInfo } from './Logging'

const PACKS_CM = 'kwirth-packs'

export interface IPackExtensionRef {
    extensionType: EExtensionType
    id: string
    tgz: string
    // Solo para extensionType 'docs': la documentacion no se identifica por id, sino por el par
    // (targetType, id), porque el id es el de la extension documentada y puede repetirse entre tipos.
    targetType?: string
}

export interface IPackMeta {
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    extensions: IPackExtensionRef[]
    requiresRestart?: boolean
}

export class PackManager {
    private configMaps: IConfigMaps

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async listInstalled(): Promise<IPackMeta[]> {
        return (await this.configMaps.read(PACKS_CM, [])) as IPackMeta[]
    }

    async isInstalled(id: string): Promise<boolean> {
        const packs = await this.listInstalled()
        return packs.some(p => p.id === id)
    }

    async savePack(meta: IPackMeta): Promise<void> {
        const packs = await this.listInstalled()
        const updated = [...packs.filter(p => p.id !== meta.id), meta]
        await this.configMaps.write(PACKS_CM, updated)
        logInfo(ELogComponent.CORE, `Pack '${meta.id}' v${meta.version} saved`)
    }

    async removePack(id: string): Promise<void> {
        const packs = await this.listInstalled()
        await this.configMaps.write(PACKS_CM, packs.filter(p => p.id !== id))
        logInfo(ELogComponent.CORE, `Pack '${id}' removed`)
    }

    async getPackMeta(id: string): Promise<IPackMeta | undefined> {
        const packs = await this.listInstalled()
        return packs.find(p => p.id === id)
    }
}
