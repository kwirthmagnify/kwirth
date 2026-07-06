import { EChannelInstances, EChannelMode, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'

// Decides whether a channel's back is hosted here (local) or lives elsewhere (remote).
// A 'single' channel (one back per cluster, the old "daemon") is hosted only by the in-cluster
// Kwirth; on desktop/docker it is announced as remote and not started here (avoids split-brain).
// 'multi' (default) is always local.
export const resolveChannelMode = (requirements: IBackChannelRequirements, inCluster: boolean): EChannelMode =>
    (requirements.instances === EChannelInstances.SINGLE && !inCluster) ? EChannelMode.REMOTE : EChannelMode.LOCAL
