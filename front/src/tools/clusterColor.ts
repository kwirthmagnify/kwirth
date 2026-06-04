const hueFromName = (name: string): number => {
    let hash = 0
    for (let i = 0; i < name.length; i++)
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return Math.abs(hash) % 360
}

export const clusterColor = (name: string, mode: 'light' | 'dark' = 'light') => {
    if (!name) return {
        dot:   'transparent',
        tabBg: mode === 'dark' ? '#2a2a2a' : '#ebebeb'
    }
    const hue = hueFromName(name)
    return {
        dot:   `hsl(${hue}, 55%, 45%)`,
        tabBg: mode === 'dark'
            ? `hsl(${hue}, 30%, 26%)`   // visible sobre grey[900] sin saturar
            : `hsl(${hue}, 22%, 89%)`   // visible próximo a #ebebeb
    }
}
