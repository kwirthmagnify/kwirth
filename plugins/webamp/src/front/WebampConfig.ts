import { IWebampInstanceConfig, DEFAULT_M3U_URL } from '../common/WebampTypes'

export { IWebampInstanceConfig, IWebampStream, DEFAULT_M3U_URL } from '../common/WebampTypes'

export interface IWebampConfig {
}

export class WebampConfig implements IWebampConfig {
}

export class WebampInstanceConfig implements IWebampInstanceConfig {
    m3uUrl: string = ''
}
