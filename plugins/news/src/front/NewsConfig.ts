import { ENewsFeed } from '../common/NewsTypes'
export { ENewsFeed }

export interface INewsChannelConfig {
    maxItems: number
}

export class NewsChannelConfig implements INewsChannelConfig {
    maxItems = 50
}

export interface INewsInstanceConfig {
    selectedFeeds: ENewsFeed[]
}

export class NewsInstanceConfig implements INewsInstanceConfig {
    selectedFeeds = Object.values(ENewsFeed)
}
