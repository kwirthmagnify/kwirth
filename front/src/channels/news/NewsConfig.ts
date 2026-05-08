export const feedsAvailable = ['kubernetes', 'ai']  //+++ move this to a backend API

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
