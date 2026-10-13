/*
    DCE `file-manager`: the stylesheet it injects, and that it injects it exactly once.

    ⚠️ What is NOT here, and why: `@jfvilas/react-file-manager` touches `document` **while it is being
    imported**, so anything that pulls it in cannot be loaded outside a browser. That the instance
    hands out the namespace, and that the component is really there, is checked by the e2e against a
    real Chromium — which is also where it matters. Faking a `document` to load the library here would
    be testing a browser that does not exist.
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STYLE_ID, injectCss } from '../src/front/css'
import fileManagerCss from '@jfvilas/react-file-manager/dist/style.css'

/** A stand-in for the few things injectCss touches. Not a browser — just the surface it uses. */
const fakeDocument = () => {
    const byId = new Map<string, { id: string, textContent: string }>()
    const appended: { id: string, textContent: string }[] = []
    const doc = {
        getElementById: (id: string) => byId.get(id) ?? null,
        createElement: (_tag: string) => ({ id: '', textContent: '' }),
        head: {
            appendChild: (node: { id: string, textContent: string }) => {
                appended.push(node)
                byId.set(node.id, node)
            }
        }
    }
    return { doc: doc as unknown as Document, appended }
}

test('the stylesheet goes on the page, under the id that marks it as ours', () => {
    const { doc, appended } = fakeDocument()
    injectCss(doc, fileManagerCss)

    assert.equal(appended.length, 1)
    assert.equal(appended[0].id, STYLE_ID)
    assert.equal(appended[0].textContent, fileManagerCss)
})

test('🔴 injecting twice adds one <style>, not two: a reload must not stack 100 KB of CSS', () => {
    const { doc, appended } = fakeDocument()
    injectCss(doc, fileManagerCss)
    injectCss(doc, fileManagerCss)
    injectCss(doc, fileManagerCss)

    assert.equal(appended.length, 1)
})

test("the stylesheet is the file manager's own, and it is the whole thing", () => {
    assert.ok(fileManagerCss.length > 10000, `the stylesheet is suspiciously small (${fileManagerCss.length} bytes)`)
    // Selectors the library really ships: a stylesheet swapped for another one would fail here.
    assert.match(fileManagerCss, /\.loader-container/)
    assert.match(fileManagerCss, /\.file-explorer/)
})
