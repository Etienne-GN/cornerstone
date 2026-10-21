import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const policy = loadGjs(
  fileURLToPath(new URL('../../src/mirror/policy.js', import.meta.url)),
)

const MONITORS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 720 },
]

function load({ primaryIndex = 0, statusArea = {} } = {}) {
  const Main = {
    layoutManager: { primaryIndex: 0, monitors: MONITORS },
    panel: { statusArea },
  }
  const ns = loadGjs(
    fileURLToPath(new URL('../../src/mirror/catalog.js', import.meta.url)),
    {
      Main,
      _: (s) => s,
      global: {
        display: { get_monitor_plug_name: (i) => `HDMI-${i}` },
      },
      CATALOG_KEY: policy.CATALOG_KEY,
      EXCLUDED_ROLES: policy.EXCLUDED_ROLES,
      monitorKey: policy.monitorKey,
    },
  )
  return { ns, panelManager: { dtpPrimaryMonitor: { index: primaryIndex } } }
}

class Settings {
  constructor() {
    this.values = { 'mirror-indicator-catalog': '{}' }
    this.writes = 0
  }
  get_string(key) {
    return this.values[key]
  }
  set_string(key, value) {
    this.writes++
    this.values[key] = value
  }
}

const published = (settings) =>
  JSON.parse(settings.values['mirror-indicator-catalog'])

test('dash-to-panel primary monitor comes first with key main', () => {
  const { ns, panelManager } = load({ primaryIndex: 1 })
  const settings = new Settings()
  ns.publishCatalog(settings, panelManager)
  const { monitors } = published(settings)
  assert.deepEqual(
    monitors.map((m) => [m.key, m.primary, m.width, m.height]),
    [
      ['main', true, 2560, 1440],
      ['connector:HDMI-0', false, 1920, 1080],
      ['connector:HDMI-2', false, 1280, 720],
    ],
  )
})

test('falls back to the system primary without a dash-to-panel one', () => {
  for (const manager of [undefined, {}]) {
    const { ns } = load()
    const settings = new Settings()
    ns.publishCatalog(settings, manager)
    assert.equal(published(settings).monitors[0].key, 'main')
    assert.equal(published(settings).monitors[0].width, 1920)
  }
})

test('roles are sorted by label and excluded roles are absent', () => {
  const statusArea = {
    zeta: { accessible_name: 'Alpha' },
    beta: {},
    power: { accessible_name: 'Power' },
    quickSettings: {},
    dateMenu: {},
    gone: null,
  }
  const { ns, panelManager } = load({ statusArea })
  const settings = new Settings()
  ns.publishCatalog(settings, panelManager)
  assert.deepEqual(published(settings).roles, [
    { role: 'zeta', label: 'Alpha (zeta)' },
    { role: 'beta', label: 'beta' },
  ])
})

test('unchanged catalog is not rewritten', () => {
  const { ns, panelManager } = load()
  const settings = new Settings()
  ns.publishCatalog(settings, panelManager)
  ns.publishCatalog(settings, panelManager)
  assert.equal(settings.writes, 1)
})

test('clearCatalog resets to an empty object', () => {
  const { ns, panelManager } = load()
  const settings = new Settings()
  ns.publishCatalog(settings, panelManager)
  ns.clearCatalog(settings)
  assert.equal(settings.values['mirror-indicator-catalog'], '{}')
})

test('dtpPrimaryIndex prefers the dash-to-panel primary', () => {
  const { ns } = load()
  assert.equal(ns.dtpPrimaryIndex({ dtpPrimaryMonitor: { index: 2 } }), 2)
  assert.equal(ns.dtpPrimaryIndex(null), 0)
})
