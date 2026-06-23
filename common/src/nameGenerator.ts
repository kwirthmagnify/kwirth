const ADJECTIVES = [
    'eager', 'silent', 'clever', 'swift', 'bold', 'dark', 'bright', 'cold', 'wild', 'calm',
    'deep', 'sharp', 'quiet', 'fierce', 'lone', 'hidden', 'fast', 'ancient', 'distant', 'electric',
    'phantom', 'rogue', 'broken', 'noble', 'hollow', 'frozen', 'burning', 'glowing', 'twisted', 'sacred',
    'lost', 'raw', 'free', 'pure', 'strange', 'cursed', 'lucid', 'restless', 'ashen', 'wandering'
]

const SCIENTISTS = [
    'turing', 'lovelace', 'hopper', 'knuth', 'dijkstra', 'shannon', 'neumann', 'babbage', 'boole', 'hamilton',
    'liskov', 'engelbart', 'wozniak', 'ritchie', 'kernighan', 'torvalds', 'stallman', 'euler', 'gauss', 'tesla',
    'curie', 'feynman', 'hawking', 'einstein', 'darwin', 'fermat', 'pascal', 'leibniz', 'church', 'godel',
    'chomsky', 'diffie', 'hellman', 'rivest', 'shamir', 'vigenere', 'stroustrup', 'gosling', 'kay', 'cerf'
]

const TECH_NOUNS = [
    'cipher', 'trace', 'phantom', 'scanner', 'signal', 'pattern', 'filter', 'watcher',
    'sentinel', 'daemon', 'probe', 'stream', 'lens', 'monitor', 'shadow', 'vector',
    'parser', 'inspector', 'relay', 'vault'
]

export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const pickAdjective = (): string => pick(ADJECTIVES)

export const generateSessionName = (usedNames: string[] = []): string => {
    const used = new Set(usedNames)
    for (let i = 0; i < 20; i++) {
        const adj = pick(ADJECTIVES)
        const noun = Math.random() < 0.5 ? pick(SCIENTISTS) : pick(TECH_NOUNS)
        const name = `${adj}_${noun}`
        if (!used.has(name)) return name
    }
    return `session_${Date.now()}`
}
