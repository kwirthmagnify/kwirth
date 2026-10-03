import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/**
 * The Webamp channel does not consume cluster data: the music player runs entirely
 * in the front (iframe). The back exists only to fulfil the Kwirth channel contract.
 */
export interface IWebampMessage extends IInstanceMessage {
    msgtype: 'webampmessage'
}

/** A stream entry parsed from an M3U playlist (name + URL). */
export interface IWebampStream {
    /** Display name for the stream. */
    name: string
    /** URL of the stream (MP3, OGG, M3U8, etc.). */
    url: string
}

/** Default M3U playlist URL — 80s radio stations from a public GitHub repo. */
export const DEFAULT_M3U_URL = 'https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/80s.m3u'

export interface IWebampInstanceConfig {
    /** URL of an M3U playlist to fetch on start. Parsed entries become initial tracks. */
    m3uUrl?: string
}
