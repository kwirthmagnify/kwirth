import { ICompositeNode, ICompositeFanoutNode, ICompositeTimedNode, ICompositeRegexNode, ITreeEntry } from './types'

// ─── Path helpers ──────────────────────────────────────────────────────────────

export function nodeAtPath(root: ICompositeNode, path: string): ICompositeNode | undefined {
    if (!path) return root
    return _getAt(root as unknown, path.split('.')) as ICompositeNode | undefined
}

function _getAt(node: unknown, parts: string[]): unknown {
    if (parts.length === 0) return node
    const [key, ...rest] = parts
    if (node === null || typeof node !== 'object') return undefined
    const idx = Number(key)
    const next = !isNaN(idx)
        ? (node as unknown[])[idx]
        : (node as Record<string, unknown>)[key]
    return _getAt(next, rest)
}

export function deleteNodeAtPath(root: ICompositeNode, path: string): ICompositeNode {
    if (!path) return root
    const clone = deepClone(root)
    const parts = path.split('.')
    const lastKey = parts[parts.length - 1]
    const parentParts = parts.slice(0, -1)

    let parent: unknown = clone
    for (const part of parentParts) {
        if (parent === null || typeof parent !== 'object') return clone
        const idx = Number(part)
        parent = !isNaN(idx) ? (parent as unknown[])[idx] : (parent as Record<string, unknown>)[part]
    }

    if (parent === null || typeof parent !== 'object') return clone
    const idx = Number(lastKey)
    if (!isNaN(idx)) {
        (parent as unknown[]).splice(idx, 1)
    } else {
        delete (parent as Record<string, unknown>)[lastKey]
    }
    return clone
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────

export function addFanoutTarget(root: ICompositeNode, path: string, newNode: ICompositeNode): ICompositeNode {
    const clone = deepClone(root)
    const fanout = (path ? nodeAtPath(clone, path) : clone) as ICompositeFanoutNode
    fanout.targets.push(newNode)
    return clone
}

export function setNextNode(root: ICompositeNode, path: string, next: ICompositeNode): ICompositeNode {
    const clone = deepClone(root)
    const node = (path ? nodeAtPath(clone, path) : clone) as ICompositeTimedNode | ICompositeRegexNode
    node.next = next
    return clone
}

// ─── Default node factory ─────────────────────────────────────────────────────

export function createNode(type: 'fanout' | 'ref' | 'timed' | 'regex'): ICompositeNode {
    if (type === 'fanout') return { type: 'fanout', targets: [] }
    if (type === 'timed')  return { type: 'timed', configName: '' }
    if (type === 'regex')  return { type: 'regex', configName: '' }
    return { type: 'ref', senderId: '', configName: '' }
}

// ─── Tree children for rendering ─────────────────────────────────────────────

export function getTreeEntries(node: ICompositeNode, basePath: string): ITreeEntry[] {
    if (node.type === 'fanout') {
        return node.targets.map((target, i) => ({
            kind: 'node' as const,
            node: target,
            path: basePath ? `${basePath}.targets.${i}` : `targets.${i}`,
            label: '',
        }))
    }
    if ((node.type === 'timed' || node.type === 'regex') && node.next) {
        return [{
            kind: 'node' as const,
            node: node.next,
            path: basePath ? `${basePath}.next` : 'next',
            label: '→',
        }]
    }
    return []
}

// ─── DFS path list (for keyboard navigation) ──────────────────────────────────

export function getAllNodePaths(node: ICompositeNode, basePath: string): string[] {
    const result = [basePath]
    for (const entry of getTreeEntries(node, basePath)) {
        result.push(...getAllNodePaths(entry.node, entry.path))
    }
    return result
}

// ─── Parent path ─────────────────────────────────────────────────────────────

export function getParentPath(path: string): string {
    if (!path) return ''
    const parts = path.split('.')
    const lastPart = parts[parts.length - 1]
    // named property (e.g. 'next'): go up 1 level; array index (e.g. '0'): go up 2 levels (field + index)
    const toRemove = isNaN(Number(lastPart)) ? 1 : 2
    return parts.slice(0, -toRemove).join('.')
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T
}
