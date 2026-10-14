/*
    Two small helpers of the core's front that Magnify used while it was part of the core. A plugin cannot
    import the core's sources, and they are too small to be worth a place in kwirth-common-front, so they
    are copied as they were.
*/

const hueFromName = (name: string): number => {
    let hash = 0
    for (let i = 0; i < name.length; i++)
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return Math.abs(hash) % 360
}

/** The colour the core gives a cluster (its dot, and the background of its tabs), the same here. */
export const clusterColor = (name: string, mode: 'light' | 'dark' = 'light') => {
    if (!name) return {
        dot:   'transparent',
        tabBg: mode === 'dark' ? '#2a2a2a' : '#ebebeb'
    }
    const hue = hueFromName(name)
    return {
        dot:   `hsl(${hue}, 55%, 45%)`,
        tabBg: mode === 'dark'
            ? `hsl(${hue}, 30%, 26%)`
            : `hsl(${hue}, 22%, 89%)`
    }
}

/** Fetch options for a GET against the core with the user's access key. */
export const addGetAuthorization = (accessString: string) => {
    return {
        headers: {
            Authorization: accessString ? 'Bearer ' + accessString : '',
            'X-Kwirth-App': 'true'
        }
    }
}
