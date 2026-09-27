import { IChannel, IChannelObject, IContentProps } from '../../channels/IChannel'
import { ChannelErrorBoundary } from './ChannelErrorBoundary'

interface ITabContentProps {
    channel?:IChannel
    channelObject?: IChannelObject
}

/*
    A tab's content is painted by the EXTENSION, so it goes wrapped in its boundary: what falls over is
    the tab, not the whole of Kwirth (see ChannelErrorBoundary).
*/
const TabContent: React.FC<ITabContentProps> = (props:ITabContentProps) => {
    const showContent = () => {
        if (!props.channel) return
        let ChannelTabContent = props.channel.TabContent
        let channelProps:IContentProps = {
            channelObject: props.channelObject!
        }
        return <ChannelTabContent {...channelProps}/>
    }
    return <ChannelErrorBoundary channelId={props.channel?.channelId}>{ showContent() }</ChannelErrorBoundary>
}
export { TabContent }
