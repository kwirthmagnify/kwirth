export function objectClone(obj: any): any {
    if (!obj) return undefined
    return JSON.parse(JSON.stringify(obj))
}

// Base of pinocchio's guide as served by the core. The tarball is published with targetType 'plugin'
// and id 'pinocchio' (see build-docs-tgz.mjs), and DocsApi serves it at /core/docs/:targetType/:id.
export function docsUrl(clusterUrl?: string): string {
    return `${(clusterUrl ?? '').replace(/\/+$/, '')}/core/docs/plugin/pinocchio`
}

export { MsgBoxButtons, MsgBoxOk, MsgBoxOkWarning, MsgBoxOkError, MsgBoxOkCancel, MsgBoxYesNo, MsgBoxYesNoCancel, MsgBoxWait, MsgBoxWaitCancel } from '@kwirthmagnify/kwirth-common-front'
