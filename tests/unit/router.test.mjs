import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const path = fileURLToPath(
  new URL('../../src/actionCenter/router.js', import.meta.url),
)

// Same save/restore contract as GNOME's extensions/extension.js.
class InjectionManager {
  constructor() {
    this._saved = []
  }
  overrideMethod(obj, name, factory) {
    this._saved.push([obj, name, obj[name]])
    obj[name] = factory(obj[name])
  }
  clear() {
    for (const [obj, name, original] of this._saved.reverse()) {
      if (original === undefined) delete obj[name]
      else obj[name] = original
    }
    this._saved = []
  }
}

const {
  InstanceOverrides,
  isUsableSource,
  monitorIndexAt,
  pickPanelForMonitor,
} = loadGjs(path, { InjectionManager })

const panel = (index, isPrimary = false) => ({
  monitor: { index },
  isPrimary,
})

test('pickPanelForMonitor returns the panel on that monitor', () => {
  const panels = [panel(0, true), panel(1), panel(2)]
  assert.equal(pickPanelForMonitor(panels, 1), panels[1])
  assert.equal(pickPanelForMonitor(panels, 2), panels[2])
  assert.equal(pickPanelForMonitor(panels, 0), panels[0])
})

test('pickPanelForMonitor falls back to the primary panel', () => {
  const panels = [panel(1), panel(0, true)]
  assert.equal(pickPanelForMonitor(panels, 3), panels[1])
  assert.equal(pickPanelForMonitor(panels, -1), panels[1])
})

test('pickPanelForMonitor without a primary uses the first panel', () => {
  const panels = [panel(1), panel(2)]
  assert.equal(pickPanelForMonitor(panels, 0), panels[0])
  assert.equal(pickPanelForMonitor([], 0), null)
  assert.equal(pickPanelForMonitor(undefined, 0), null)
})

test('monitorIndexAt finds the monitor holding the point', () => {
  const monitors = [
    { index: 0, x: 0, y: 0, width: 1920, height: 1080 },
    { index: 1, x: 1920, y: 0, width: 1280, height: 1024 },
  ]
  assert.equal(monitorIndexAt(monitors, 10, 10, 0), 0)
  assert.equal(monitorIndexAt(monitors, 1920, 0, 0), 1)
  assert.equal(monitorIndexAt(monitors, 1919, 1079, 1), 0)
  assert.equal(monitorIndexAt(monitors, 3199, 1023, 0), 1)
  assert.equal(monitorIndexAt(monitors, 3200, 10, 0), 0, 'right edge')
  assert.equal(monitorIndexAt(monitors, 2000, 1050, 0), 0, 'below monitor 1')
})

test('isUsableSource needs a mapped, allocated, non-empty actor', () => {
  const actor = (props) => ({
    mapped: true,
    width: 40,
    height: 30,
    has_allocation: () => true,
    ...props,
  })
  assert.equal(isUsableSource(actor()), true)
  assert.equal(isUsableSource(actor({ mapped: false })), false)
  assert.equal(isUsableSource(actor({ has_allocation: () => false })), false)
  assert.equal(isUsableSource(actor({ width: 0 })), false)
  assert.equal(isUsableSource(actor({ height: 0 })), false)
  assert.equal(isUsableSource(actor({ width: NaN })), false)
  assert.equal(isUsableSource(null), false)
})

class Menu {
  toggle() {
    return 'stock toggle'
  }
  open() {
    return 'stock open'
  }
}

test('InstanceOverrides leaves no own-property shadow behind', () => {
  const menu = new Menu()
  const overrides = new InstanceOverrides()
  overrides.override(menu, 'toggle', () => () => 'routed')
  overrides.override(
    menu,
    'open',
    (original) =>
      function () {
        return `routed ${original.call(this)}`
      },
  )
  assert.equal(menu.toggle(), 'routed')
  assert.equal(menu.open(), 'routed stock open')

  overrides.clear()
  assert.equal(Object.hasOwn(menu, 'toggle'), false)
  assert.equal(Object.hasOwn(menu, 'open'), false)
  assert.equal(menu.toggle, Menu.prototype.toggle)
  assert.equal(menu.toggle(), 'stock toggle')
})

test('InstanceOverrides keeps an own property that was already there', () => {
  const menu = new Menu()
  const theirs = () => 'other extension'
  menu.toggle = theirs
  const overrides = new InstanceOverrides()
  overrides.override(menu, 'toggle', () => () => 'routed')
  overrides.clear()
  assert.equal(Object.hasOwn(menu, 'toggle'), true)
  assert.equal(menu.toggle, theirs)
})
