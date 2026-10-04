// DCE `three`: the object it hands out — the three.js namespace, shared by all consumers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createThreeFront } from '../src/front/ThreeDceImpl'

test('createThreeFront returns an object with the DCE id', () => {
    const dce = createThreeFront('three')
    assert.equal(dce.id, 'three')
})

test('THREE is the three.js namespace with the expected constructors', () => {
    const { THREE } = createThreeFront('three')
    assert.equal(typeof THREE.WebGLRenderer, 'function')
    assert.equal(typeof THREE.Scene, 'function')
    assert.equal(typeof THREE.PerspectiveCamera, 'function')
    assert.equal(typeof THREE.Mesh, 'function')
    assert.equal(typeof THREE.BufferGeometry, 'function')
    assert.equal(typeof THREE.Raycaster, 'function')
    assert.equal(typeof THREE.Vector3, 'function')
    assert.equal(typeof THREE.Color, 'function')
})

test('two calls share the same THREE namespace (singleton module)', () => {
    const a = createThreeFront('three')
    const b = createThreeFront('three')
    assert.equal(a.THREE, b.THREE)
})
