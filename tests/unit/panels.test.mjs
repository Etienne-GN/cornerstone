import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

class Emitter {
  constructor() {
    this.handlers = []
  }
  connectObject(signal, cb, owner) {
    this.handlers.push({ signal, cb, owner })
  }
  disconnectObject(owner) {
    this.handlers = this.handlers.filter((h) => h.owner !== owner)
  }
  emit(signal, ...args) {
    for (const h of [...this.handlers])
      if (h.signal === signal) h.cb(this, ...args)
  }
}

const extensionManager = new Emitter()
const topBar = { statusArea: { dateMenu: {} } }
const global = {}

const { PanelSource, DTP_UUID } = loadGjs(
  fileURLToPath(new URL('../../src/panels.js', import.meta.url)),
  {
    Main: { extensionManager, panel: topBar },
    EventEmitter: Emitter,
    global,
  },
)

function counted(source) {
  const counter = { n: 0 }
  source.connectObject('changed', () => counter.n++, counter)
  return counter
}

test('without dash-to-panel only the top bar is listed', () => {
  delete global.dashToPanel
  const source = new PanelSource()
  source.enable()
  assert.deepEqual([...source.dtpPanels], [])
  assert.equal(source.hasDashToPanel, false)
  assert.deepEqual([...source.statusAreas], [topBar.statusArea])
  source.disable()
})

test('panels-created and dash-to-panel state changes emit changed', () => {
  global.dashToPanel = new Emitter()
  const source = new PanelSource()
  const changes = counted(source)
  source.enable()

  const secondary = { statusArea: { dateMenu: {} } }
  global.dashToPanel.panels = [{ statusArea: topBar.statusArea }, secondary]
  global.dashToPanel.emit('panels-created')
  assert.equal(changes.n, 1)
  assert.deepEqual([...source.statusAreas], [topBar.statusArea, secondary.statusArea])

  extensionManager.emit('extension-state-changed', { uuid: 'other@x' })
  assert.equal(changes.n, 1, 'other extensions are ignored')
  source.disable()
  assert.equal(global.dashToPanel.handlers.length, 0)
})

test('a re-enabled dash-to-panel is followed through its new object', () => {
  const first = new Emitter()
  global.dashToPanel = first
  const source = new PanelSource()
  const changes = counted(source)
  source.enable()

  delete global.dashToPanel
  extensionManager.emit('extension-state-changed', { uuid: DTP_UUID })
  assert.equal(changes.n, 1)
  assert.equal(first.handlers.length, 0, 'old object released')

  const second = new Emitter()
  global.dashToPanel = second
  extensionManager.emit('extension-state-changed', { uuid: DTP_UUID })
  second.emit('panels-created')
  assert.equal(changes.n, 3)
  first.emit('panels-created')
  assert.equal(changes.n, 3, 'the old object no longer reaches us')
  source.disable()
  assert.equal(extensionManager.handlers.length, 0)
})
