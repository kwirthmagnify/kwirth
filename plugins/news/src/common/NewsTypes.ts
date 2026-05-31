import { EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow } from "@kwirthmagnify/kwirth-common"

export interface INewsItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
    category: string
}

export interface INewsMessageResponse {
    msgtype: 'newsmessageresponse'
    channel: 'news'
    type: EInstanceMessageType
    action: EInstanceMessageAction
    flow: EInstanceMessageFlow
    instance: string
    item?: INewsItem
}
