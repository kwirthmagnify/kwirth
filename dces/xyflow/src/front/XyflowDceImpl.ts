import * as reactFlow from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { IXyflow } from '../common/index'

/*
    Both libraries are BUNDLED here: they are the DCE's content. React is not: it resolves against the
    core's own (window.__kwirth__.React), because React Flow's hooks only work against the React that
    renders them.
*/
export const createXyflowFront = (id: string): IXyflow => ({
    id,
    reactFlow,
    loadElk: async () => ELK
})
