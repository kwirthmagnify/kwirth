export interface INewsItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
    category: string
}

export interface INewsData {
    items: INewsItem[]
    paused: boolean
    started: boolean
}

export class NewsData implements INewsData {
    items: INewsItem[] = []
    paused = false
    started = false
}
