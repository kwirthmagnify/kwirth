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
    // La documentacion se identifica por (targetType, id), pero como dependencia basta el id: quien
    // depende de una guia depende de la de SU extension, y ahi el par no aporta nada.
    docs: IInstalledRef[]
}

function semverGte(installed: string, required: string): boolean {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0)
    const [ma, mi, pa] = parse(installed)
    const [mb, mib, pb] = parse(required)
    if (ma !== mb) return ma > mb
    if (mi !== mib) return mi > mib
    return pa >= pb
}

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
