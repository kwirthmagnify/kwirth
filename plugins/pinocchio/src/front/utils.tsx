export function objectClone(obj: any): any {
    if (!obj) return undefined
    return JSON.parse(JSON.stringify(obj))
}

export { MsgBoxButtons, MsgBoxOk, MsgBoxOkWarning, MsgBoxOkError, MsgBoxOkCancel, MsgBoxYesNo, MsgBoxYesNoCancel, MsgBoxWait, MsgBoxWaitCancel } from '@kwirthmagnify/kwirth-common-front'
