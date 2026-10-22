// Tray organization: per monitor order, box and state (shown / overflow /
// hidden), the overflow popup opening icon menus against its button, the
// overflow placed like an icon, icon spacing, and everything back in place
// on disable. Run with --monitors 2.

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

const OVERFLOW = 'cornerstone:overflow'
const ROLES = ['trayA', 'trayB', 'trayC', 'trayD', 'trayE']
const ICONS = {
  trayA: 'face-smile-symbolic',
  trayB: 'weather-clear-symbolic',
  trayC: 'starred-symbolic',
  trayD: 'mail-unread-symbolic',
  trayE: 'emblem-system-symbolic',
}

// Distinct column and row positions of the overflow's icons.
function gridShape(flow) {
  const boxes = flow
    .get_children()
    .filter((c) => c.visible)
    .map((c) => c.get_allocation_box())
  for (const box of boxes)
    assert(box.get_height() > 0 && box.get_width() > 0, 'icon cell has a size')
  const xs = new Set(boxes.map((b) => Math.round(b.x1)))
  const ys = new Set(boxes.map((b) => Math.round(b.y1)))
  return [xs.size, ys.size]
}

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

const allocatedWidth = (actor) => actor.get_allocation_box().get_width()

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

  // Five icons in the overflow: a grid, as many columns as the setting.
  settings().set_int('tray-overflow-columns', 2)
  setLayout(
    mainKey,
    ROLES.map((role) => ({ role, box: 'right', state: 'overflow' })),
  )
  await waitFor(() => overflow.flow.get_n_children() === ROLES.length)
  overflow.menu.toggle()
  await waitFor(() => overflow.menu.isOpen)
  await sleep(400)
  let [columns, rows] = gridShape(overflow.flow)
  assert(columns === 2 && rows === 3, `2 columns: ${columns} x ${rows}`)
  await captureStage('4-overflow-grid')
  settings().set_int('tray-overflow-columns', 4)
  await sleep(300)
  ;[columns, rows] = gridShape(overflow.flow)
  assert(columns === 4 && rows === 2, `4 columns: ${columns} x ${rows}`)
  await captureStage('5-overflow-grid-4')
  overflow.menu.close()
  await waitFor(() => !overflow.menu.isOpen)
  settings().reset('tray-overflow-columns')

  // The overflow placed by its item: after trayB on the primary bar, in
  // the left box on the secondary one.
  setLayout(mainKey, [
    { role: 'trayB', box: 'right', state: 'shown' },
    { role: OVERFLOW, box: 'right', state: 'shown' },
    { role: 'trayA', box: 'right', state: 'overflow' },
  ])
  await waitFor(
    () =>
      right.get_child_at_index(0) === fakes.trayB.container &&
      right.get_child_at_index(1) === overflowOf(primaryState())?.container,
  )
  const otherState = () => c._states.get(panel)
  setLayout(otherKey, [
    { role: 'trayC', box: 'right', state: 'overflow' },
    { role: OVERFLOW, box: 'left', state: 'shown' },
  ])
  await waitFor(
    () =>
      overflowOf(otherState())?.container.get_parent() === panel._leftBox,
  )
  await sleep(300)
  await captureStage('6-overflow-moved')

  // Spacing: the padding goes, on real icons and mirrors, and comes back.
  const [mirrorB] = await waitFor(() => {
    const found = mirrorsIn(panel._rightBox, 'trayB')
    return found.length === 1 && found
  })
  const padded = allocatedWidth(fakes.trayB)
  const icon = (button) => button.get_first_child().get_preferred_width(-1)[1]
  assert(padded > icon(fakes.trayB), `theme padding: ${padded}`)
  settings().set_int('tray-icon-spacing', 0)
  await waitFor(
    () =>
      allocatedWidth(fakes.trayB) === icon(fakes.trayB) &&
      allocatedWidth(mirrorB) === icon(mirrorB) &&
      allocatedWidth(overflowOf(primaryState())) ===
        icon(overflowOf(primaryState())),
  )
  await sleep(300)
  await captureStage('7-spacing-0')
  settings().reset('tray-icon-spacing')
  await waitFor(() => allocatedWidth(fakes.trayB) === padded)
  assert(fakes.trayB.get_style() === null, 'trayB style given back')

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
  fakes.trayC.set_style('color: red;')
  settings().set_int('tray-icon-spacing', 2)
  await waitFor(() => fakes.trayB.get_style() !== null)
  await disable()
  settings().reset('tray-icon-spacing')
  assert(
    ROLES.every(
      (role) =>
        fakes[role].get_style() === (role === 'trayC' ? 'color: red;' : null),
    ),
    'tray icon styles given back on disable',
  )
  const restored = right.get_children()
  assert(
    original.every((child, i) => restored[i] === child),
    'top bar right box back in its original order',
  )
  for (const fake of Object.values(fakes)) fake.destroy()
  done('tray')
}
