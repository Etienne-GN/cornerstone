import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const path = fileURLToPath(new URL('../../src/extension.js', import.meta.url))

const calls = []
const logged = []
const faults = new Set()

const maybeThrow = (name) => {
  calls.push(name)
  if (faults.has(name)) throw new Error(`${name} failed`)
}

class Emitter {
  connectObject(signal, callback) {
    this.callback = callback
  }
  disconnectObject() {
    maybeThrow('panel source disconnect')
  }
}

const fakes = {
  console: {
    error: (...args) => logged.push(args),
    warn() {},
    log() {},
  },
  Extension: class {
    constructor(metadata) {
      this.metadata = metadata
    }
    getSettings() {
      return {}
    }
  },
  PanelSource: class extends Emitter {
    constructor() {
      super()
      calls.push('panel source')
    }
    get dtpPanels() {
      return []
    }
    enable() {
      calls.push('panel source enable')
    }
    disable() {
      maybeThrow('panel source disable')
    }
  },
  MirrorController: class {
    constructor() {
      calls.push('mirror controller')
    }
    attach() {
      calls.push('mirror attach')
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
}

const { CornerstoneExtension } = loadGjs(path, fakes)

function reset() {
  calls.length = 0
  logged.length = 0
  faults.clear()
}

test('enable builds every component and attaches the mirror', () => {
  reset()
  const extension = new CornerstoneExtension({})
  extension.enable()
  assert.deepEqual(calls, [
    'panel source',
    'action center',
    'mirror controller',
    'panel source enable',
    'mirror attach',
  ])
  extension.disable()
})

test('a panel change re-attaches the mirror', () => {
  reset()
  const extension = new CornerstoneExtension({})
  extension.enable()
  calls.length = 0
  extension.panels.callback()
  assert.deepEqual(calls, ['mirror attach'])
  extension.disable()
})

test('disable runs every teardown step when each one throws', () => {
  reset()
  const extension = new CornerstoneExtension({})
  extension.enable()
  for (const name of [
    'panel source disconnect',
    'action center destroy',
    'mirror controller destroy',
  ])
    faults.add(name)
  calls.length = 0

  assert.doesNotThrow(() => extension.disable())
  assert.deepEqual(calls, [
    'panel source disconnect',
    'action center destroy',
    'mirror controller destroy',
  ])
  assert.deepEqual(logged.map(([context]) => context), [
    '[cornerstone] disable panel source',
    '[cornerstone] disable action center',
    '[cornerstone] disable mirror controller',
  ])
  assert.equal(extension.actionCenter, null)
  assert.equal(extension.mirrorController, null)
  assert.equal(extension.panels, null)
})

test('disable before any component exists does not throw', () => {
  reset()
  const extension = new CornerstoneExtension({})
  assert.doesNotThrow(() => extension.disable())
  assert.deepEqual(logged, [])
})
