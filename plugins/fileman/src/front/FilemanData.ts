import { IFileObject } from "@jfvilas/react-file-manager"
export { EFilemanCommand, IFilemanMessage, IFilemanMessageResponse } from '../common/FilemanTypes'

export interface IFilemanData {
    paused: boolean
    started: boolean
    files: IFileObject[]
    currentPath: string
    ri: string|undefined
    unlock?: () => void
}

export class FilemanData implements IFilemanData {
    paused = false
    started = false
    files = []
    currentPath = '/'
    ri = undefined
}

