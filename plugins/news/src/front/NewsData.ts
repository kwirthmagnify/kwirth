export { INewsItem } from '../common/NewsTypes'

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
