import GLib from 'gi://GLib'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'

import {
  dtpSettings,
  MONITORS,
  assert,
  disable,
  done,
  enable,
  ext,
  logLines,
  sleep,
  waitFor,
} from '../lib.js'

export const METRICS = {}

const ROLE = 'omniTest'
const DISPOSED = /already disposed/

function secondaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isStandalone && !p.isPrimary)
}

function primaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isPrimary)
}

function mirrorsIn(box, role = ROLE) {
  return box
    .get_children()
    .map((c) => c.get_first_child?.())
    .filter((a) => a?._cornerstoneMirror && a._role === role)
}

function stageMirrors(actor = global.stage, found = []) {
  if (actor._cornerstoneMirror) found.push(actor)
  for (const child of actor.get_children()) stageMirrors(child, found)
  return found
}

function addFake() {
  const button = new PanelMenu.Button(0.5, ROLE)
  button.add_child(
    new St.Icon({
      icon_name: 'face-smile-symbolic',
      style_class: 'system-status-icon',
    }),
  )
  Main.panel.addToStatusArea(ROLE, button, 0, 'right')
  return button
}

async function oneMirror(what) {
  const panel = await waitFor(secondaryPanel)
  const [mirror] = await waitFor(() => {
    const found = mirrorsIn(panel._rightBox)
    return found.length === 1 && found
  })
  const all = stageMirrors().filter((a) => a._role === ROLE)
  assert(all.length === 1, `${what}: ${all.length} ${ROLE} mirrors on stage`)
  return { panel, mirror }
}

async function noMirror(what) {
  const panel = await waitFor(secondaryPanel)
  await waitFor(() => mirrorsIn(panel._rightBox).length === 0)
  assert(
    stageMirrors().every((a) => a._role !== ROLE),
    `${what}: ${ROLE} mirror left on stage`,
  )
}

// The mirror's own bin takes the place of the panel's quick settings button
// inside the container dash-to-panel positions.
function systemMenuIsMirror(panel) {
  const child = panel.statusArea.quickSettings.container.get_child()
  return child?.get_first_child?.()?._cornerstoneMirror === true
}

function allocated(actor) {
  return waitFor(() => actor.mapped && actor.width > 0 && actor.height > 0)
}

async function enableAndWait() {
  await enable()
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
}

export async function run() {
  const nMonitors = global.display.get_n_monitors()
  assert(nMonitors === 2, `mirrors needs 2 monitors, shell sees ${nMonitors}`)

  await enableAndWait()
  const controller = ext().stateObj.mirrorController
  assert(controller, 'extension exposes mirrorController')
  const settings = ext().stateObj.getSettings()
  const policy = await import(
    `file://${GLib.getenv('CORNERSTONE_EXT_DIR')}/mirror/policy.js`
  )

  let panel = await waitFor(secondaryPanel)
  await waitFor(() => systemMenuIsMirror(panel))
  assert(
    panel.statusArea.quickSettings.container.get_child() !==
      panel.statusArea.quickSettings,
    'stock quick settings swapped out while mirrored',
  )

  let fake = addFake()
  let { mirror } = await oneMirror('after add')
  await allocated(mirror.container)
  await allocated(panel.allocationMap.systemMenu.actor)

  const key = policy.monitorKey(
    global.display,
    panel.monitor.index,
    primaryPanel().monitor.index,
  )
  policy.setIndicatorEnabled(settings, key, ROLE, false)
  await noMirror('policy off')
  policy.setIndicatorEnabled(settings, key, ROLE, true)
  ;({ mirror } = await oneMirror('policy on'))

  settings.set_boolean('mirror-indicators', false)
  await noMirror('mirroring off')
  await waitFor(() => !systemMenuIsMirror(panel))
  assert(
    panel.allocationMap.systemMenu.actor ===
      panel.statusArea.quickSettings.container,
    'stock quick settings back in SYSTEM_MENU',
  )
  assert(stageMirrors().length === 0, 'no mirror at all while off')
  settings.set_boolean('mirror-indicators', true)
  await oneMirror('mirroring on')
  await waitFor(() => systemMenuIsMirror(panel))

  const disposedBefore = logLines(DISPOSED).length

  fake.destroy()
  await noMirror('source destroyed')

  for (let i = 0; i < 3; i++) {
    fake = addFake()
    await oneMirror(`recreate ${i}`)
    fake.destroy()
    await noMirror(`destroy ${i}`)
  }
  for (let i = 0; i < 3; i++) {
    fake = addFake()
    if (i < 2) fake.destroy()
  }
  await oneMirror('burst recreate')
  await sleep(500)
  await oneMirror('burst settled')

  for (let i = 0; i < 5; i++) {
    await disable()
    assert(stageMirrors().length === 0, `cycle ${i}: mirrors after disable`)
    await enableAndWait()
    await oneMirror(`cycle ${i}`)
  }

  const before = await oneMirror('before vertical')
  const index = before.panel.monitor.index
  dtpSettings().set_string('panel-positions', JSON.stringify({ [index]: 'LEFT' }))
  const vertical = await waitFor(() => {
    const p = secondaryPanel()
    return p && p !== before.panel && p.checkIfVertical() && p
  })
  ;({ mirror } = await oneMirror('vertical'))
  assert(mirror !== before.mirror, 'vertical mirror was rebuilt')
  assert(mirror._vertical === true, 'syncOrientation(true) applied')
  await allocated(mirror.container)
  await waitFor(() => systemMenuIsMirror(vertical))
  assert(
    stageMirrors().find((a) => a._role === 'quickSettings')?._vertical === true,
    'quick settings mirror is vertical',
  )

  const beforeReset = await oneMirror('before reset')
  beforeReset.panel.panelManager._reset()
  await waitFor(() => secondaryPanel() !== beforeReset.panel)
  ;({ mirror } = await oneMirror('after reset'))
  assert(mirror !== beforeReset.mirror, 'reset rebuilt the mirror')
  panel = secondaryPanel()
  await waitFor(() => systemMenuIsMirror(panel))
  assert(
    stageMirrors().filter((a) => a._role === 'quickSettings').length === 1,
    'one quick settings mirror after reset',
  )

  const disposed = logLines(DISPOSED).slice(disposedBefore)
  assert(!disposed.length, `already disposed warnings: ${disposed.join(' | ')}`)

  await disable()
  assert(stageMirrors().length === 0, 'no _cornerstoneMirror actor after disable')
  assert(
    Main.panel.statusArea.quickSettings.container.get_parent() !== null,
    'primary quick settings restored',
  )

  fake.destroy()
  dtpSettings().set_string('panel-positions', '{}')

  done('mirrors')
}
