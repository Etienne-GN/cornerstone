// Spike: can a companion extension own Dash to Panel's date menu slot?
//
// Run with --monitors 2 --with-extension dash-to-panel@jderose9.github.com.
// Cornerstone itself stays disabled: the slot logic under test is the small
// SlotSwap below. It puts its own actor in each panel's dateMenu container
// (a St.Bin, so Dash to Panel keeps positioning the container) and hides the
// quickSettings container. The spike holds if that survives Dash to Panel
// rebuilding its panels, being disabled and re-enabled, and if restore()
// puts every original button back.

import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js'

import { MONITORS, assert, captureStage, done, sleep, waitFor } from '../lib.js'

const DTP = 'dash-to-panel@jderose9.github.com'

// Dash to Panel reuses dateMenu and quickSettings buttons across rebuilds
// (PERSISTENTSTORAGE), so state is tracked per container, not per panel.
class SlotSwap {
  constructor() {
    this._dates = new Map()
    this._systems = new Set()
  }

  get count() {
    return this._dates.size
  }

  panels() {
    return global.dashToPanel?.panels ?? [{ statusArea: Main.panel.statusArea }]
  }

  apply() {
    for (const panel of this.panels()) {
      const date = panel.statusArea.dateMenu?.container
      if (date && !this._dates.has(date)) {
        const original = date.get_child()
        const button = new St.Label({
          text: 'CORNERSTONE',
          style: 'background: #e01b24; color: white; padding: 0 8px;',
          y_align: 2,
        })
        date.set_child(button)
        this._dates.set(date, { original, button })
      }
      const system = panel.statusArea.quickSettings?.container
      if (system && !this._systems.has(system)) {
        // Dash to Panel shows it again when it rebuilds; keep it hidden.
        system.hide()
        system.connectObject('notify::visible', () => system.hide(), this)
        this._systems.add(system)
      }
    }
  }

  button(panel) {
    return this._dates.get(panel.statusArea.dateMenu?.container)?.button
  }

  restore() {
    for (const [date, { original, button }] of this._dates) {
      date.set_child(original)
      button.destroy()
    }
    for (const system of this._systems) {
      system.disconnectObject(this)
      system.show()
    }
    this._dates.clear()
    this._systems.clear()
  }
}

function dtp() {
  return Main.extensionManager.lookup(DTP)
}

async function setDtp(enabled) {
  if (enabled) Main.extensionManager.enableExtension(DTP)
  else Main.extensionManager.disableExtension(DTP)
  const want = enabled ? ExtensionState.ACTIVE : ExtensionState.INACTIVE
  await waitFor(() => {
    const { state, error } = dtp()
    if (state === ExtensionState.ERROR) throw new Error(`${DTP}: ${error}`)
    return state === want
  })
}

// The slot is "held" on a panel when our actor is shown, has a size, and
// sits on that panel's monitor.
function assertHeld(swap, panel, what) {
  const button = swap.button(panel)
  assert(button, `${what}: no Cornerstone actor in the dateMenu slot`)
  assert(button.get_parent() === panel.statusArea.dateMenu.container,
    `${what}: actor is not inside the dateMenu container`)
  assert(button.mapped, `${what}: actor is not mapped`)
  const [w, h] = button.get_transformed_size()
  assert(w > 0 && h > 0, `${what}: actor has no size (${w}x${h})`)
  const [x, y] = button.get_transformed_position()
  const m = panel.monitor ?? Main.layoutManager.primaryMonitor
  assert(x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height,
    `${what}: actor at ${x},${y} is outside monitor ${m.index}`)
  const system = panel.statusArea.quickSettings?.container
  assert(!system?.visible, `${what}: quickSettings container still visible`)
}

function assertAllHeld(swap, what) {
  const panels = swap.panels()
  for (const [i, panel] of panels.entries()) assertHeld(swap, panel, `${what} #${i}`)
  console.log(`[cornerstone-test] ${what}: held on ${panels.length} panel(s), ` +
    `${swap.count} container(s) touched`)
}

export async function run() {
  assert(dtp(), `${DTP} missing: run with --with-extension ${DTP}`)
  await setDtp(true)
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)

  const swap = new SlotSwap()
  // Re-apply on every rebuild, and follow global.dashToPanel being replaced
  // when Dash to Panel is disabled and enabled again.
  let emitter = null
  const follow = () => {
    if (emitter === global.dashToPanel) return
    emitter?.disconnectObject?.(swap)
    emitter = global.dashToPanel ?? null
    emitter?.connectObject?.('panels-created', () => swap.apply(), swap)
  }
  Main.extensionManager.connectObject('extension-state-changed', (_m, ext) => {
    if (ext.uuid !== DTP) return
    follow()
    swap.apply()
  }, swap)
  follow()

  swap.apply()
  await sleep(300)
  assertAllHeld(swap, 'applied')
  await captureStage('1-applied')

  const settings = dtp().stateObj.getSettings(
    'org.gnome.shell.extensions.dash-to-panel',
  )
  settings.set_boolean('multi-monitors', false)
  await waitFor(() => global.dashToPanel?.panels?.length === 1)
  await sleep(300)
  assertAllHeld(swap, 'single monitor')
  settings.set_boolean('multi-monitors', true)
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
  await sleep(300)
  assertAllHeld(swap, 'rebuilt')
  await captureStage('2-rebuilt')

  await setDtp(false)
  await sleep(300)
  assertAllHeld(swap, 'stock top bar')
  await captureStage('3-stock-top-bar')

  await setDtp(true)
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
  await sleep(300)
  assertAllHeld(swap, 're-enabled')
  await captureStage('4-re-enabled')

  Main.extensionManager.disconnectObject(swap)
  emitter?.disconnectObject?.(swap)
  swap.restore()
  await sleep(300)
  for (const [i, panel] of swap.panels().entries()) {
    const date = panel.statusArea.dateMenu.container
    assert(date.get_child() === panel.statusArea.dateMenu,
      `restored #${i}: dateMenu button is not back in its container`)
    assert(panel.statusArea.quickSettings.container.visible,
      `restored #${i}: quickSettings container is hidden`)
  }
  await captureStage('5-restored')

  done('spike-slot')
}
