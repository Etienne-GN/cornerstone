import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const logged = []
const { Slots } = loadGjs(
  fileURLToPath(new URL('../../src/slots.js', import.meta.url)),
  { console: { error: (...args) => logged.push(args) } },
)

// A St.Bin with connectObject/disconnectObject keyed by owner.
class Bin {
  constructor(child) {
    this._child = child
    this.visible = true
    this.handlers = new Map()
  }
  get_child() {
    return this._child
  }
  set_child(child) {
    this._child = child
  }
  hide() {
    const changed = this.visible
    this.visible = false
    if (changed) this.emit('notify::visible')
  }
  show() {
    const changed = !this.visible
    this.visible = true
    if (changed) this.emit('notify::visible')
  }
  connectObject(...args) {
    const owner = args.pop()
    const list = this.handlers.get(owner) ?? []
    for (let i = 0; i < args.length; i += 2) list.push([args[i], args[i + 1]])
    this.handlers.set(owner, list)
  }
  disconnectObject(owner) {
    this.handlers.delete(owner)
  }
  emit(signal) {
    for (const list of [...this.handlers.values()])
      for (const [name, cb] of list) if (name === signal) cb()
  }
}

test('swap keeps the first child as the original across swaps', () => {
  const own = {}
  const bin = new Bin(own)
  const slots = new Slots()
  const a = {}
  const b = {}
  slots.swap(bin, a)
  slots.swap(bin, b)
  assert.equal(bin.get_child(), b)
  assert.equal(slots.owner(bin), b)
  slots.release(bin)
  assert.equal(bin.get_child(), own)
  assert.equal(slots.owner(bin), null)
  assert.equal(bin.handlers.size, 0, 'no handler left')
})

test('release leaves a child someone else put there', () => {
  const own = {}
  const bin = new Bin(own)
  const slots = new Slots()
  slots.swap(bin, {})
  const other = {}
  bin.set_child(other)
  assert.equal(slots.owner(bin), null)
  slots.release(bin)
  assert.equal(bin.get_child(), other)
})

test('hide keeps the container hidden until show', () => {
  const bin = new Bin({})
  const slots = new Slots()
  slots.hide(bin)
  bin.show()
  assert.equal(bin.visible, false, 'shown again by someone else, re-hidden')
  slots.show(bin)
  assert.equal(bin.visible, true)
  bin.hide()
  bin.show()
  assert.equal(bin.visible, true, 'no watch left after show')
})

test('releasing a swap keeps the hide watch of the same container', () => {
  const own = {}
  const bin = new Bin(own)
  const slots = new Slots()
  slots.swap(bin, {})
  slots.hide(bin)
  slots.release(bin)
  bin.show()
  assert.equal(bin.visible, false)
  assert.equal(bin.get_child(), own)
  slots.releaseAll()
  assert.equal(bin.visible, true)
  assert.equal(bin.handlers.size, 0)
})

test('a destroyed container is forgotten', () => {
  const bin = new Bin({})
  const slots = new Slots()
  slots.swap(bin, {})
  slots.hide(bin)
  bin.emit('destroy')
  assert.equal(slots.owner(bin), null)
  logged.length = 0
  bin.set_child = () => assert.fail('touched a destroyed container')
  slots.releaseAll()
  assert.deepEqual(logged, [])
})

test('releaseAll logs a failing container and restores the others', () => {
  const ownA = {}
  const ownB = {}
  const a = new Bin(ownA)
  const b = new Bin(ownB)
  const slots = new Slots()
  slots.swap(a, {})
  slots.swap(b, {})
  a.set_child = () => {
    throw new Error('gone')
  }
  logged.length = 0
  slots.releaseAll()
  assert.equal(b.get_child(), ownB)
  assert.deepEqual(
    logged.map(([context, e]) => [context, e.message]),
    [['[cornerstone] slot restore', 'gone']],
  )
})
