import { EExtensionType, IDceConsumer } from '@kwirthmagnify/kwirth-common'

export interface IInstalledRef {
    id: string
    version: string
}

export interface IInstalledIndex {
    plugin: IInstalledRef[]
    provider: IInstalledRef[]
    sender: IInstalledRef[]
    theme: IInstalledRef[]
    homepage: IInstalledRef[]
    idp: IInstalledRef[]
    login: IInstalledRef[]
    webhook: IInstalledRef[]
    // Documentation is identified by (targetType, id), but as a dependency the id is enough: whoever
    // depends on a guide depends on ITS OWN extension's, and there the pair adds nothing.
    docs: IInstalledRef[]
    aitoolset: IInstalledRef[]
    dce: IInstalledRef[]
}

/** Every installable type with nobody in it. The base to build an index on when only one family matters. */
export const emptyInstalledIndex = (): IInstalledIndex =>
    ({ plugin: [], provider: [], sender: [], theme: [], homepage: [], idp: [], login: [], webhook: [], docs: [], aitoolset: [], dce: [] })

function semverGte(installed: string, required: string): boolean {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
    const [ma, mi, pa] = parse(installed)
    const [mb, mib, pb] = parse(required)
    if (ma !== mb) return ma > mb
    if (mi !== mib) return mi > mib
    return pa >= pb
}

/** '1.4.2' → 1. Nothing, or something that is not a version, → 0. */
export const majorOf = (version: string | undefined): number => parseInt((version ?? '0').split('.')[0], 10) || 0

export function validateExtensionDeps(requirements: string[], installed: IInstalledIndex): string[] {
    const errors: string[] = []
    for (const req of requirements) {
        const parts = req.split(':')
        if (parts.length !== 3) {
            errors.push(`Invalid requirement format: '${req}'`)
            continue
        }
        const [extType, extName, minVersion] = parts
        const list = installed[extType as keyof IInstalledIndex]
        if (!list) {
            errors.push(`Unknown extension type: '${extType}'`)
            continue
        }
        const found = list.find(e => e.id === extName)
        if (!found) {
            errors.push(`Required ${extType} '${extName}' (>=${minVersion}) is not installed`)
        }
        else if (!semverGte(found.version, minVersion)) {
            errors.push(`Required ${extType} '${extName}' version >=${minVersion}, found ${found.version}`)
        }
    }
    return errors
}

// ── Who depends on whom ──────────────────────────────────────────────────────────────────────────────

/** An installed extension, seen only through what it requires. Any manager's metadata fits. */
export interface IRequirer {
    type: EExtensionType
    id: string
    requiresExtension?: string[]
}

/**
 * Who, among what is installed, requires `<type>:<id>:…`.
 *
 * It is what blocks uninstalling a DCE in use (PRD RF9) and a breaking upgrade (RF11): the answer is the
 * list, not a boolean, because the message has to say WHO — an admin told "it is in use" goes looking
 * through eleven managers for the culprit.
 */
export const findConsumers = (installed: IRequirer[], type: EExtensionType, id: string): IDceConsumer[] => {
    const prefix = `${type}:${id}:`
    const consumers: IDceConsumer[] = []
    for (const ext of installed) {
        for (const requirement of ext.requiresExtension ?? []) {
            if (requirement.startsWith(prefix)) consumers.push({ type: ext.type, id: ext.id, requirement })
        }
    }
    return consumers
}

/**
 * The consumers a new version would BREAK: those whose minimum sits on a lower major than the version
 * arriving (PRD decision D10). A requirement is a minimum, so moving forward within a major breaks
 * nobody; changing major is the semver word for "this breaks", and that is exactly what is refused
 * while somebody depends on the old one.
 */
export const consumersBrokenByMajor = (consumers: IDceConsumer[], newVersion: string): IDceConsumer[] => {
    const newMajor = majorOf(newVersion)
    return consumers.filter(c => majorOf(c.requirement.split(':')[2]) < newMajor)
}

/** 'plugin excubitor (dce:iria-icons:1.0.0), homepage iria (dce:iria-icons:1.2.0)' */
export const describeConsumers = (consumers: IDceConsumer[]): string =>
    consumers.map(c => `${c.type} '${c.id}' (${c.requirement})`).join(', ')

// ── Requirements at install time (PRD RF8) ───────────────────────────────────────────────────────────

/*
    Until the DCE type, `requiresExtension` was only validated when installing a PACK: an extension
    installed on its own could declare anything and nobody looked. For a DCE that would mean installing
    a consumer whose DCE is missing and finding out at runtime, from a `getDce()` that throws.

    So the managers ask here before installing. Only the `dce:` requirements are checked (generalising
    it to every type is a change of contract for extensions already out there — plan backlog B7), and
    the source of what is installed is REGISTERED by the core once its DCE manager exists: a manager does
    not get to know about the others.
*/
type TInstalledDceSource = () => Promise<IInstalledRef[]>
let installedDceSource: TInstalledDceSource | undefined

export const setInstalledDceSource = (source: TInstalledDceSource | undefined): void => { installedDceSource = source }

/** The `dce:` requirements among a list, if any. */
export const dceRequirementsOf = (requiresExtension: string[] | undefined): string[] =>
    (requiresExtension ?? []).filter(r => r.startsWith(`${EExtensionType.DCE}:`))

/**
 * Refuses to install `kind` `id` when a DCE it requires is missing or too old.
 *
 * Skipped for what comes from dev, bundled or a pack: a pack validates all its members together before
 * installing any; dev is declarative and the developer's own; bundled is the image's, and it is
 * installed before anything else exists to check against.
 */
export const assertDceRequirements = async (kind: string, id: string, requiresExtension: string[] | undefined, installedFrom: string | undefined): Promise<void> => {
    const requirements = dceRequirementsOf(requiresExtension)
    if (!requirements.length) return
    if (installedFrom === 'dev' || installedFrom === 'bundled' || installedFrom?.startsWith('pack:')) return
    if (!installedDceSource) return
    const errors = validateExtensionDeps(requirements, { ...emptyInstalledIndex(), dce: await installedDceSource() })
    if (errors.length) throw new Error(`${kind} '${id}' cannot be installed: ${errors.join('; ')}`)
}
