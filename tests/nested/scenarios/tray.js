// Tray organization: per monitor order, box and state (shown / overflow /
// hidden), the overflow popup opening icon menus against its button, and
// everything back in place on disable. Run with --monitors 2.

import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

import {
  MONITORS,
  assert,
  bars,
  captureStage,
  disable,
  done,
  enable,
  ext,
  sleep,
  waitFor,
} from '../lib.js'

const ROLES = ['trayA', 'trayB']
const ICONS = { trayA: 'face-smile-symbolic', trayB: 'weather-clear-symbolic' }

function addFake(role) {
  const button = new PanelMenu.Button(0.5, role)
  button.add_child(
    new St.Icon({ icon_name: ICONS[role], style_class: 'system-status-icon' }),
  )
  button.menu.addMenuItem(new PopupMenu.PopupMenuItem(`${role} menu`))
  Main.panel.addToStatusArea(role, button, 0, 'right')
  return button
}

const controller = () => ext().stateObj.mirrorController
const settings = () => ext().stateObj.getSettings()

function secondary() {
  return global.dashToPanel.panels.find((p) => p.isStandalone && !p.isPrimary)
}

function mirrorsIn(actor, role) {
  return actor
    .get_children()
    .map((c) => c.get_first_child?.())
    .filter((a) => a?._cornerstoneMirror && a._role === role)
}

function overflowOf(state) {
  return state?.overflow ?? null
}

function setLayout(key, items) {
  const s = settings()
  const layout = JSON.parse(s.get_string('tray-layout'))
  layout[key] = items
  s.set_string('tray-layout', JSON.stringify(layout))
}

export async function run() {
  assert(MONITORS === 2, 'tray needs --monitors 2')
  const fakes = Object.fromEntries(ROLES.map((r) => [r, addFake(r)]))
  const right = Main.panel._rightBox
  const original = right.get_children()

  await bars()
  await enable()
  await sleep(500)
  const c = controller()
  const panel = secondary()
  const primaryBar = c._primaryBar
  const mainKey = c._keyFor(primaryBar)
  const otherKey = c._keyFor(panel)
  assert(mainKey === 'main', `primary key is ${mainKey}`)

  for (const role of ROLES)
    assert(
      mirrorsIn(panel._rightBox, role).length === 1,
      `${role} mirrored on the secondary bar by default`,
    )

  // Primary: trayB first, trayA in the overflow.
  setLayout(mainKey, [
    { role: 'trayB', box: 'right', state: 'shown' },
    { role: 'trayA', box: 'right', state: 'overflow' },
  ])
  const primaryState = () => c._states.get(c._primaryBar)
  await waitFor(() => overflowOf(primaryState())?.container.visible)
  const overflow = overflowOf(primaryState())
  assert(right.get_child_at_index(0) === overflow.container, 'chevron first')
  assert(
    right.get_child_at_index(1) === fakes.trayB.container,
    'trayB right after the chevron',
  )
  assert(
    fakes.trayA.container.get_parent() === c._primaryTray.holder,
    'trayA out of the top bar',
  )
  const [inFlow] = await waitFor(() => {
    const found = mirrorsIn(overflow.flow, 'trayA')
    return found.length === 1 && found
  })
  assert(
    mirrorsIn(panel._rightBox, 'trayA').length === 1,
    'secondary bar still shows trayA',
  )

  // Secondary: trayA hidden, trayB in the left box.
  setLayout(otherKey, [
    { role: 'trayA', box: 'right', state: 'hidden' },
    { role: 'trayB', box: 'left', state: 'shown' },
  ])
  await waitFor(() => mirrorsIn(panel._leftBox, 'trayB').length === 1)
  await waitFor(() => mirrorsIn(panel._rightBox, 'trayA').length === 0)
  await sleep(300)
  await captureStage('1-arranged')

  overflow.menu.toggle()
  await waitFor(() => overflow.menu.isOpen)
  await sleep(400)
  await captureStage('2-overflow-open')

  overflow.menu.close()
  await waitFor(() => !overflow.menu.isOpen)
  inFlow._onButtonPress(null)
  await waitFor(() => fakes.trayA.menu.isOpen)
  assert(
    fakes.trayA.menu.sourceActor === overflow,
    'trayA menu opens against the chevron',
  )
  await sleep(400)
  await captureStage('3-icon-menu')
  fakes.trayA.menu.close()
  await waitFor(() => !fakes.trayA.menu.isOpen)
  await sleep(400)

  settings().reset('tray-layout')
  await waitFor(() => !overflowOf(primaryState()))
  await waitFor(() =>
    ROLES.every((role) => mirrorsIn(panel._rightBox, role).length === 1),
  )
  assert(
    fakes.trayA.container.get_parent() === right,
    'trayA back in the top bar after reset',
  )

  setLayout(mainKey, [{ role: 'trayA', box: 'left', state: 'hidden' }])
  await waitFor(
    () => fakes.trayA.container.get_parent() === c._primaryTray.holder,
  )
  await disable()
  const restored = right.get_children()
  assert(
    original.every((child, i) => restored[i] === child),
    'top bar right box back in its original order',
  )
  for (const fake of Object.values(fakes)) fake.destroy()
  done('tray')
}
