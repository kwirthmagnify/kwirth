import { Cluster } from '../model/Cluster'
import { EChannelMode } from '@kwirthmagnify/kwirth-common'

// instances/desktop Fase 2: a 'single' channel announced as REMOTE on one Kwirth is actually hosted by
// the in-cluster Kwirth of the same cluster. Among the connected clusters, find the one that hosts the
// channel LOCAL for the same cluster id. Returns that host Cluster, or undefined if none hosts it.
export const resolveRemoteChannelHost = (
    channelId: string,
    targetClusterId: string,
    clusters: Cluster[]
): Cluster | undefined => {
    if (!targetClusterId) return undefined
    return clusters.find(c =>
        c.clusterInfo?.id === targetClusterId &&
        (c.kwirthData?.channels ?? []).some(ch => ch.id === channelId && ch.mode === EChannelMode.LOCAL)
    )
}
