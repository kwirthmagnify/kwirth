import { ICompositeNode, ICompositeTeeNode, ICompositeRegexNode, ICompositeRegexRule, IRuleLeaf, ITreeEntry } from './types'

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

export function updateNodeAtPath(root: ICompositeNode, path: string, value: ICompositeNode | undefined): ICompositeNode {
    if (!path) return value ?? root
    const clone = deepClone(root)
    _setAt(clone as unknown, path.split('.'), value)
    return clone
}

function _setAt(node: unknown, parts: string[], value: unknown): void {
    if (node === null || typeof node !== 'object') return
    const [key, ...rest] = parts
    if (rest.length === 0) {
        const idx = Number(key)
        if (!isNaN(idx)) {
            (node as unknown[])[idx] = value
        } else if (value === undefined) {
            delete (node as Record<string, unknown>)[key]
        } else {
            (node as Record<string, unknown>)[key] = value
        }
        return
    }
    const idx = Number(key)
    const next = !isNaN(idx)
        ? (node as unknown[])[idx]
        : (node as Record<string, unknown>)[key]
    _setAt(next, rest, value)
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

export function addTeeTarget(root: ICompositeNode, path: string, newNode: ICompositeNode): ICompositeNode {
    const clone = deepClone(root)
    const tee = (path ? nodeAtPath(clone, path) : clone) as ICompositeTeeNode
    tee.targets.push(newNode)
    return clone
}

export function addRegexRule(root: ICompositeNode, path: string, rule: ICompositeRegexRule): ICompositeNode {
    const clone = deepClone(root)
    const regex = (path ? nodeAtPath(clone, path) : clone) as ICompositeRegexNode
    regex.rules.push(rule)
    return clone
}

export function updateRegexRule(root: ICompositeNode, nodePath: string, ruleIndex: number, rule: ICompositeRegexRule): ICompositeNode {
    const clone = deepClone(root)
    const regex = (nodePath ? nodeAtPath(clone, nodePath) : clone) as ICompositeRegexNode
    regex.rules[ruleIndex] = rule
    return clone
}

export function deleteRegexRule(root: ICompositeNode, nodePath: string, ruleIndex: number): ICompositeNode {
    const clone = deepClone(root)
    const regex = (nodePath ? nodeAtPath(clone, nodePath) : clone) as ICompositeRegexNode
    regex.rules.splice(ruleIndex, 1)
    return clone
}

export function setRegexDefault(root: ICompositeNode, nodePath: string, action: 'send' | 'drop', target?: ICompositeNode): ICompositeNode {
    const clone = deepClone(root)
    const regex = (nodePath ? nodeAtPath(clone, nodePath) : clone) as ICompositeRegexNode
    regex.defaultAction = action
    if (action === 'send' && target) {
        regex.defaultTarget = target
    } else {
        delete regex.defaultTarget
    }
    return clone
}

// ─── Default node factory ─────────────────────────────────────────────────────

export function createNode(type: 'tee' | 'regex' | 'ref'): ICompositeNode {
    if (type === 'tee') return { type: 'tee', targets: [] }
    if (type === 'regex') return { type: 'regex', rules: [], defaultAction: 'drop' }
    return { type: 'ref', senderId: '', configName: '' }
}

// ─── Tree children for rendering ─────────────────────────────────────────────

export function getTreeEntries(node: ICompositeNode, basePath: string): ITreeEntry[] {
    if (node.type === 'tee') {
        return node.targets.map((target, i) => ({
            kind: 'node' as const,
            node: target,
            path: basePath ? `${basePath}.targets.${i}` : `targets.${i}`,
            label: '',
        }))
    }
    if (node.type === 'regex') {
        const entries: ITreeEntry[] = []
        node.rules.forEach((rule, i) => {
            const rulePath = basePath ? `${basePath}.rules.${i}` : `rules.${i}`
            entries.push({ kind: 'rule', rule, path: rulePath } satisfies IRuleLeaf)
        })
        const defAction = node.defaultAction ?? 'drop'
        if (defAction === 'drop' || !node.defaultTarget) {
            entries.push({ kind: 'drop', label: `default → ${defAction}` })
        } else {
            entries.push({
                kind: 'node',
                node: node.defaultTarget,
                path: basePath ? `${basePath}.defaultTarget` : 'defaultTarget',
                label: 'default →',
            })
        }
        return entries
    }
    return []
}

// ─── DFS path list (for keyboard navigation) ──────────────────────────────────

export function getAllNodePaths(node: ICompositeNode, basePath: string): string[] {
    const result = [basePath]
    for (const entry of getTreeEntries(node, basePath)) {
        if (entry.kind === 'rule') {
            result.push(entry.path)
            if (entry.rule.action === 'send' && entry.rule.target) {
                result.push(...getAllNodePaths(entry.rule.target, `${entry.path}.target`))
            }
        } else if (entry.kind === 'node') {
            result.push(...getAllNodePaths(entry.node, entry.path))
        }
    }
    return result
}

// ─── Parent path ─────────────────────────────────────────────────────────────

export function getParentPath(path: string): string {
    if (!path) return ''
    const parts = path.split('.')
    const last = parts[parts.length - 1]
    if (last === 'target' || last === 'defaultTarget') return parts.slice(0, -1).join('.')
    return parts.slice(0, -2).join('.')
}

// ─── Rule path helpers ────────────────────────────────────────────────────────

export function isRulePath(path: string): boolean {
    if (!path) return false
    const parts = path.split('.')
    return parts.length >= 2 && parts[parts.length - 2] === 'rules' && !isNaN(Number(parts[parts.length - 1]))
}

export function ruleAtPath(root: ICompositeNode, path: string): ICompositeRegexRule | undefined {
    if (!isRulePath(path)) return undefined
    const parts = path.split('.')
    const ruleIndex = Number(parts[parts.length - 1])
    const regexNodePath = parts.slice(0, -2).join('.')
    const regexNode = regexNodePath ? nodeAtPath(root, regexNodePath) : root
    if (!regexNode || regexNode.type !== 'regex') return undefined
    return regexNode.rules[ruleIndex]
}

export function getRuleIndex(rulePath: string): number {
    return Number(rulePath.split('.').at(-1))
}

export function getRegexNodePathFromRulePath(rulePath: string): string {
    return rulePath.split('.').slice(0, -2).join('.')
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T
}
