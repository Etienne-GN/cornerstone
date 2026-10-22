import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const src = (p) => fileURLToPath(new URL(`../../src/button/${p}`, import.meta.url))
const GObject = { registerClass: (_meta, klass) => klass ?? _meta }
const Base = class {}

const { orderIndicators, indicatorNames } = loadGjs(src('indicators.js'), {
  GObject,
  St: { BoxLayout: Base },
  Clutter: {},
  Main: {},
})
const { elementOrder } = loadGjs(src('button.js'), {
  GObject,
  St: {},
  Clutter: {},
  PanelMenu: { Button: Base },
  ClockLabel: Base,
  IndicatorStrip: Base,
})
const { formatClock } = loadGjs(src('clock.js'), {
  GObject,
  St: { Label: Base },
  Clutter: {},
  GLib: {},
  GnomeDesktop: {},
  Pango: {},
})

const names = (entries) => entries.map((e) => e.name)

test('saved indicators come first in their order, others keep GNOME order', () => {
  const entries = ['network', 'volumeOutput', 'system', 'bluetooth'].map(
    (name) => ({ name }),
  )
  assert.deepEqual(names(orderIndicators(entries, ['system', 'gone'])), [
    'system',
    'network',
    'volumeOutput',
    'bluetooth',
  ])
  assert.deepEqual(names(orderIndicators(entries, [])), names(entries))
})

test('indicators are named by QuickSettings field or extension class', () => {
  class Actor {
    constructor(parent) {
      this.parent = parent
    }
    get_parent() {
      return this.parent
    }
  }
  class Vitals extends Actor {}
  const box = { children: [], get_children: () => box.children }
  const qs = { _indicators: box }
  qs._network = new Actor(box)
  qs._system = new Actor(box)
  const a = new Vitals(box)
  const b = new Vitals(box)
  box.children = [qs._network, a, qs._system, b]
  assert.deepEqual(names(indicatorNames(qs)), [
    'network',
    'extension:Vitals',
    'system',
    'extension:Vitals#2',
  ])
})

test('element order drops unknown and repeated names', () => {
  assert.deepEqual(
    [...elementOrder(['clock', 'bogus', 'clock', 'indicators'])],
    ['clock', 'indicators'],
  )
  assert.deepEqual([...elementOrder([])], ['indicators', 'clock'])
  assert.deepEqual([...elementOrder(['clock'])], ['clock'])
})

test('an empty format shows GNOME clock text', () => {
  const now = { format: (f) => (f === '%H' ? '23' : null) }
  assert.equal(formatClock('', now, 'Oct 21 23:00'), 'Oct 21 23:00')
  assert.equal(formatClock('%H', now, 'x'), '23')
  assert.equal(formatClock('%Q', now, 'x'), '%Q', 'an invalid format shows as is')
})
