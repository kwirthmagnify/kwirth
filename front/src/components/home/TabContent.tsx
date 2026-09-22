import { IChannel, IChannelObject, IContentProps } from '../../channels/IChannel'
import { ChannelErrorBoundary } from './ChannelErrorBoundary'

interface ITabContentProps {
    channel?:IChannel
    channelObject?: IChannelObject
}

/*
    El contenido de una pestaña lo pinta la EXTENSION, asi que va envuelto en su boundary: lo que se
    cae es la pestaña, no Kwirth entero (ver ChannelErrorBoundary).
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
