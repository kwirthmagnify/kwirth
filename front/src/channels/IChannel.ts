import {
    IChannelObject as IChannelObjectBase,
    ISetupProps as ISetupPropsBase,
    IContentProps as IContentPropsBase,
    IChannel, TChannelConstructor,
    EChannelRefreshAction, ENotifyLevel,
    IChannelMessageAction, IChannelSettings, IChannelRequirements
} from '@kwirthmagnify/kwirth-common-front'
import { IResourceSelected } from '../components/ResourceSelector'
import { IClusterInfo } from '../model/Cluster'
import { INotification } from '../components/MenuNotification'
import { MetricDefinition } from './metrics/MetricsTypes'

interface IChannelObject extends IChannelObjectBase {
    metricsList?: Map<string, MetricDefinition>
    notifications?: INotification[]
    clusterInfo?: IClusterInfo
    createTab?: (resource: IResourceSelected, start: boolean, settings: any) => void
    frontChannels?: Map<string, TChannelConstructor>
}

interface ISetupProps extends ISetupPropsBase {
    channelObject: IChannelObject
}

interface IContentProps extends IContentPropsBase {
    channelObject: IChannelObject
}

export { EChannelRefreshAction, ENotifyLevel }
export type { IChannel, IChannelObject, ISetupProps, IContentProps, TChannelConstructor, IChannelMessageAction, IChannelSettings, IChannelRequirements }
