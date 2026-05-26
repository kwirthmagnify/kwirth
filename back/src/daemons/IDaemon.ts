import { IBackDaemonObject } from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'
import { ClusterInfo } from '../model/ClusterInfo'

export { IDaemon }

export type TDaemonConstructor = (new (clusterInfo: ClusterInfo, backDaemonObject: IBackDaemonObject) => IDaemon) | undefined

export const createDaemonInstance = (ctor: TDaemonConstructor, clusterInfo: ClusterInfo, backDaemonObject: IBackDaemonObject): IDaemon | null => {
    if (!ctor) throw new Error('Error: daemonConstructor is empty')
    return new ctor(clusterInfo, backDaemonObject)
}
