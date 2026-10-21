import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const path = fileURLToPath(new URL('../../src/extension.js', import.meta.url))

const calls = []
const logged = []
const faults = new Set()
const pendingInits = []

const maybeThrow = (name) => {
  calls.push(name)
  if (faults.has(name)) throw new Error(`${name} failed`)
}

const settings = {
  get_boolean: () => false,
  set_boolean() {},
  get_int: () => 1,
  set_int() {},
  connect: () => 1,
  disconnect() {},
}

const fakes = {
  console: {
    error: (...args) => logged.push(args),
    warn() {},
    log() {},
  },
  Gio: { Settings: class {} },
  GLib: {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    timeout_add: () => 1,
    Source: { remove() {} },
  },
  Shell: { WindowTracker: { get_default: () => ({}) } },
  Config: { PACKAGE_VERSION: '50.0' },
  Main: {
    sessionMode: { hasOverview: true },
    layoutManager: {
      _startingUp: false,
      uiGroup: { add_style_class_name() {}, remove_style_class_name() {} },
      disconnect() {},
    },
    extensionManager: { _extensionOrder: [] },
  },
  EventEmitter: class {},
  Extension: class {
    constructor(metadata) {
      this.metadata = metadata
      this.path = '/ext'
    }
    getSettings() {
      return settings
    }
  },
  _: (s) => s,
  PanelSettings: {
    init: () =>
      new Promise((resolve) => {
        calls.push('settings init')
        pendingInits.push(resolve)
      }),
    adjustMonitorSettings() {},
    disable: async () => maybeThrow('panel settings disable'),
    clearCache: () => calls.push('settings clear'),
  },
  PanelManager: {
    PanelManager: class {
      enable() {
        calls.push('panel manager enable')
      }
      disable() {
        maybeThrow('panel manager disable')
      }
    },
  },
  MirrorController: class {
    constructor() {
      calls.push('mirror controller')
    }
    destroy() {
      maybeThrow('mirror controller destroy')
    }
  },
  ActionCenter: class {
    constructor() {
      calls.push('action center')
    }
    watchSetting() {}
    destroy() {
      maybeThrow('action center destroy')
    }
  },
  AppIcons: { resetRecentlyClickedApp: () => calls.push('app icons reset') },
  Utils: {},
  releaseUrl: () => null,
  global: {},
}

const { DashToPanelExtension } = loadGjs(path, fakes)
const settle = () => new Promise((resolve) => setImmediate(resolve))

async function enabled() {
  const extension = new DashToPanelExtension({ version: 1 })
  const done = extension.enable()
  pendingInits.shift()()
  await done
  return extension
}

function reset() {
  calls.length = 0
  logged.length = 0
  faults.clear()
  pendingInits.length = 0
}

test('disable runs every teardown step when each one throws', async () => {
  reset()
  const extension = await enabled()
  for (const name of [
    'action center destroy',
    'panel settings disable',
    'panel manager disable',
    'mirror controller destroy',
  ])
    faults.add(name)
  calls.length = 0

  assert.doesNotThrow(() => extension.disable())
  await settle()
  assert.deepEqual(calls, [
    'action center destroy',
    'panel settings disable',
    'panel manager disable',
    'mirror controller destroy',
    'settings clear',
    'app icons reset',
  ])
  assert.deepEqual(logged.map(([context]) => context).sort(), [
    '[omnibar] disable action center',
    '[omnibar] disable mirror controller',
    '[omnibar] disable panel manager',
    '[omnibar] disable panel settings',
  ])
  assert.equal(extension.actionCenter, null)
  assert.equal(extension.mirrorController, null)
})

test('disable before any component exists does not throw', () => {
  reset()
  const extension = new DashToPanelExtension({ version: 1 })
  assert.doesNotThrow(() => extension.disable())
  assert.deepEqual(logged, [])
})

test('a disable during the awaited init stops enable from building', async () => {
  reset()
  const extension = new DashToPanelExtension({ version: 1 })
  const first = extension.enable()
  extension.disable()
  const second = extension.enable()
  pendingInits.shift()()
  await first
  const built = ['mirror controller', 'action center', 'panel manager enable']
  assert.deepEqual(
    calls.filter((c) => built.includes(c)),
    [],
    'the superseded enable built nothing',
  )
  pendingInits.shift()()
  await second
  assert.deepEqual(
    calls.filter((c) => built.includes(c)),
    built,
    'the current enable builds once',
  )
  extension.disable()
})
