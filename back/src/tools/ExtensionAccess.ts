import { EExtensionType, IExtensionAccess, IInstalledExtension } from '@kwirthmagnify/kwirth-common'

/*
    ClusterInfo.extensions: the installed extensions of any type, read-only, with their version and where
    they came from (the Status channel's tables).

    The managers are not copied: they are asked for at the moment of asking — at startup some do not exist
    yet, and what is installed changes hot. A type whose manager does not exist (yet) throws: "unknown",
    never an empty list that would read as "nothing installed".
*/

/** What every manager's listing has in common: enough to say what is installed and in which version. */
export interface IInstalledMeta {
    id: string
    version: string
    installedFrom?: string
}

export type TListInstalled = () => Promise<IInstalledMeta[]>

export const buildExtensionAccess = (sources: () => Partial<Record<EExtensionType, TListInstalled>>): IExtensionAccess => ({
    listInstalled: async (type: EExtensionType): Promise<IInstalledExtension[]> => {
        const list = sources()[type]
        if (!list) throw new Error(`there is no manager for '${type}' extensions (yet)`)
        // Only these three fields travel: a manager's metadata can carry much more (config schemas, stored code flags…).
        return (await list()).map(m => ({
            id: m.id,
            version: m.version,
            ...(m.installedFrom ? { installedFrom: m.installedFrom } : {})
        }))
    }
})
