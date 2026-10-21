import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const policy = loadGjs(
  fileURLToPath(new URL('../../src/mirror/policy.js', import.meta.url)),
)
const { planMirrors } = loadGjs(
  fileURLToPath(new URL('../../src/mirror/plan.js', import.meta.url)),
  {
    EXCLUDED_ROLES: policy.EXCLUDED_ROLES,
    sourceIsVisible: policy.sourceIsVisible,
  },
)

class Actor {
  constructor(children = [], visible = true) {
    this.children = children
    this.visible = visible
  }
  contains(other) {
    return (
      other === this || this.children.some((c) => c.contains?.(other) ?? false)
    )
  }
}

function indicator(visible = true) {
  const container = new Actor([], visible)
  return { container }
}

const all = () => true
const plain = (entries) =>
  Array.from(entries, ({ box, role, index }) => `${box}:${role}:${index}`)

test('order is preserved per box', () => {
  const statusArea = { a: indicator(), b: indicator(), c: indicator() }
  const boxes = {
    left: [statusArea.c.container],
    center: [],
    right: [statusArea.b.container, statusArea.a.container],
  }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), [
    'left:c:0',
    'right:b:0',
    'right:a:1',
  ])
})

test('disabled role is skipped and indices stay dense', () => {
  const statusArea = { a: indicator(), b: indicator(), c: indicator() }
  const boxes = {
    left: [],
    center: [],
    right: ['a', 'b', 'c'].map((r) => statusArea[r].container),
  }
  assert.deepEqual(
    plain(planMirrors(boxes, statusArea, (role) => role !== 'b')),
    ['right:a:0', 'right:c:1'],
  )
})

test('excluded roles are skipped even when enabled', () => {
  const statusArea = {
    quickSettings: indicator(),
    dateMenu: indicator(),
    activities: indicator(),
    a11y: indicator(),
    x: indicator(),
  }
  const boxes = {
    left: [statusArea.activities.container],
    center: [statusArea.dateMenu.container],
    right: ['a11y', 'x', 'quickSettings'].map((r) => statusArea[r].container),
  }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['right:x:0'])
})

test('hidden source is skipped', () => {
  const statusArea = { shown: indicator(), hidden: indicator(false) }
  const boxes = {
    left: [],
    center: [],
    right: [statusArea.hidden.container, statusArea.shown.container],
  }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), [
    'right:shown:0',
  ])
})

test('source hidden only on the primary bar is still planned', () => {
  const statusArea = { x: indicator(false) }
  policy.primaryVisibility.set(statusArea.x.container, { visible: true })
  const boxes = { left: [], center: [], right: [statusArea.x.container] }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['right:x:0'])
})

test('wrapper container is matched to its role', () => {
  const statusArea = { tray: indicator(), inner: indicator() }
  const wrapper = new Actor([statusArea.tray.container])
  const boxes = { left: [], center: [], right: [wrapper] }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['right:tray:0'])
})

test('indicator added directly without container is matched', () => {
  const bare = new Actor()
  const statusArea = { bare }
  const boxes = { left: [], center: [], right: [bare] }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['right:bare:0'])
})

test('role in the center box stays in the center box', () => {
  const statusArea = { mid: indicator(), side: indicator() }
  const boxes = {
    left: [],
    center: [statusArea.mid.container],
    right: [statusArea.side.container],
  }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), [
    'center:mid:0',
    'right:side:0',
  ])
})

test('unmatched children and missing indicators are ignored', () => {
  const statusArea = { a: indicator(), gone: null }
  const boxes = {
    left: [new Actor()],
    center: [],
    right: [statusArea.a.container],
  }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['right:a:0'])
})

test('a role is planned once even if two children match it', () => {
  const statusArea = { a: indicator() }
  const wrapper = new Actor([statusArea.a.container])
  const boxes = { left: [wrapper], center: [], right: [statusArea.a.container] }
  assert.deepEqual(plain(planMirrors(boxes, statusArea, all)), ['left:a:0'])
})
