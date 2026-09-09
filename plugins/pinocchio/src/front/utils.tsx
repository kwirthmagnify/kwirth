export function objectClone(obj: any): any {
    if (!obj) return undefined
    return JSON.parse(JSON.stringify(obj))
}

// Base de la guia de pinocchio servida por el core. El tarball se publica con targetType 'plugin' e
// id 'pinocchio' (ver build-docs-tgz.mjs), y DocsApi la sirve en /core/docs/:targetType/:id.
export function docsUrl(clusterUrl?: string): string {
    return `${(clusterUrl ?? '').replace(/\/+$/, '')}/core/docs/plugin/pinocchio`
}

export { MsgBoxButtons, MsgBoxOk, MsgBoxOkWarning, MsgBoxOkError, MsgBoxOkCancel, MsgBoxYesNo, MsgBoxYesNoCancel, MsgBoxWait, MsgBoxWaitCancel } from '@kwirthmagnify/kwirth-common-front'
