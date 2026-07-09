import { EChannelInstances, EChannelMode, IBackChannelRequirements } from '@kwirthmagnify/kwirth-common'

// Decides whether a channel's back is hosted here (local) or lives elsewhere (remote).
// A 'single' channel (one back per cluster) is hosted by the k8s-mode Kwirth home
// and only there; on desktop/docker it is announced as remote and not started (avoids split-brain).
// 'multi' (default) is always local. NOTE: the caller passes isK8s = runningEnv.isK8s
// (FORCE==='k8s' or running inside a pod) — the k8s execution env other channels also key off.
export const resolveChannelMode = (requirements: IBackChannelRequirements, isK8s: boolean): EChannelMode =>
    (requirements.instances === EChannelInstances.SINGLE && !isK8s) ? EChannelMode.REMOTE : EChannelMode.LOCAL
