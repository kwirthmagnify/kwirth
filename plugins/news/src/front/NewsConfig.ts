export const feedsAvailable = ['kubernetes', 'ai']

export interface INewsChannelConfig {
    maxItems: number
}

export class NewsChannelConfig implements INewsChannelConfig {
    maxItems = 50
}

export interface INewsInstanceConfig {
    selectedFeeds: string[]
}

export class NewsInstanceConfig implements INewsInstanceConfig {
    selectedFeeds = [...feedsAvailable]
}
