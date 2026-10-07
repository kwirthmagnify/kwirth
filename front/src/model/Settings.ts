import { IChannelSettings } from '@kwirthmagnify/kwirth-common'

class Settings {
    public channelSettings: IChannelSettings[] = []
    // 30 s, not 60: a reverse proxy in front of Kwirth closes idle connections on its own clock, and an AWS
    // ALB does it at exactly 60 s by default. A 60 s ping races that timeout and loses — measured on ECS, the
    // socket died every 60-63 s. The ping is a few bytes, so staying well under any usual proxy timeout costs
    // nothing and saves the reconnect churn.
    public keepAliveInterval: number = 30
    public channelUserPreferences: {channelId: string, data:any}[] = []
    public checkExtensionUpdates: boolean = true
}

export type { IChannelSettings }
export { Settings }