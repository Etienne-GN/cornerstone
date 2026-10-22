import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const logged = []
const tray = loadGjs(
  fileURLToPath(new URL('../../src/tray/layout.js', import.meta.url)),
  { console: { error: (...args) => logged.push(args) } },
)

const plain = (value) => JSON.parse(JSON.stringify(value))
const settings = (raw) => ({
  raw,
  get_string() {
    return this.raw
  },
  set_string(_key, value) {
    this.raw = value
  },
})

const sources = [
  { role: 'vitals', box: 'right' },
  { role: 'appindicator', box: 'right' },
  { role: 'arcmenu', box: 'left' },
]

test('nothing saved: GNOME order, all shown', () => {
  assert.deepEqual(plain(tray.planTray(sources)), [
    { role: 'vitals', box: 'right', state: 'shown' },
    { role: 'appindicator', box: 'right', state: 'shown' },
    { role: 'arcmenu', box: 'left', state: 'shown' },
  ])
})

test('saved items first, new icons after with the default state', () => {
  const saved = [
    { role: 'appindicator', box: 'center', state: 'overflow' },
    { role: 'gone', box: 'right', state: 'hidden' },
    { role: 'appindicator', box: 'left', state: 'shown' },
  ]
  const items = tray.planTray(sources, saved, (role) =>
    role === 'arcmenu' ? 'hidden' : 'shown',
  )
  assert.deepEqual(plain(items), [
    { role: 'appindicator', box: 'center', state: 'overflow' },
    { role: 'vitals', box: 'right', state: 'shown' },
    { role: 'arcmenu', box: 'left', state: 'hidden' },
  ])
})

test('read drops invalid items and logs invalid JSON once', () => {
  const s = settings(
    JSON.stringify({
      main: [
        { role: 'a', box: 'right', state: 'shown' },
        { role: 'b', box: 'top', state: 'shown' },
        { role: 'c', box: 'left', state: 'maybe' },
        'junk',
      ],
      other: 'junk',
    }),
  )
  assert.deepEqual(plain(tray.readTrayLayout(s)), {
    main: [{ role: 'a', box: 'right', state: 'shown' }],
  })
  logged.length = 0
  s.raw = '{nope'
  assert.deepEqual(plain(tray.readTrayLayout(s)), {})
  assert.deepEqual(plain(tray.readTrayLayout(s)), {})
  assert.equal(logged.length, 1)
})

test('write and reset touch only one monitor', () => {
  const s = settings('{}')
  tray.writeTrayItems(s, 'main', [
    { role: 'a', box: 'right', state: 'shown', extra: 1 },
  ])
  tray.writeTrayItems(s, 'connector:DP-2', [
    { role: 'a', box: 'left', state: 'hidden' },
  ])
  tray.resetTrayItems(s, 'main')
  assert.deepEqual(JSON.parse(s.raw), {
    'connector:DP-2': [{ role: 'a', box: 'left', state: 'hidden' }],
  })
})

test('move places an item at an index of a box', () => {
  const items = tray.planTray(sources)
  const moved = tray.moveTrayItem(items, 'arcmenu', 'right', 1)
  assert.deepEqual(
    plain(moved).map((i) => `${i.role}:${i.box}`),
    ['vitals:right', 'arcmenu:right', 'appindicator:right'],
  )
  const last = tray.moveTrayItem(items, 'vitals', 'right', 99)
  assert.deepEqual(
    plain(last).map((i) => i.role),
    ['appindicator', 'arcmenu', 'vitals'],
  )
})

test('state changes and box filters', () => {
  const items = tray.setTrayItemState(tray.planTray(sources), 'vitals', 'overflow')
  assert.deepEqual(plain(tray.itemsInBox(items, 'right')).map((i) => i.role), [
    'appindicator',
  ])
  assert.deepEqual(
    plain(tray.itemsInBox(items, 'right', 'overflow')).map((i) => i.role),
    ['vitals'],
  )
})

test('merge keeps saved icons that are absent now', () => {
  const saved = [
    { role: 'gone', box: 'right', state: 'hidden' },
    { role: 'a', box: 'right', state: 'shown' },
  ]
  const edited = [{ role: 'a', box: 'left', state: 'overflow' }]
  assert.deepEqual(plain(tray.mergeTrayItems(saved, edited)), [
    { role: 'a', box: 'left', state: 'overflow' },
    { role: 'gone', box: 'right', state: 'hidden' },
  ])
})
