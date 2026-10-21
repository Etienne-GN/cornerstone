import Clutter from 'gi://Clutter'
import Graphene from 'gi://Graphene'
import Shell from 'gi://Shell'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js'

import {
  MONITORS,
  assert,
  disable,
  done,
  enable,
  ext,
  sleep,
  waitFor,
} from '../lib.js'

export const METRICS = {}

const TEST_TITLE = 'Omnibar action center test'

const qsMenu = () => Main.panel.statusArea.quickSettings.menu
const dateMenu = () => Main.panel.statusArea.dateMenu

function place(actor) {
  const parent = actor.get_parent()
  return { actor, parent, index: parent?.get_children().indexOf(actor) }
}

function snapshot() {
  const qs = qsMenu()
  const dm = dateMenu()
  return {
    places: {
      grid: place(qs._grid),
      overlay: place(qs._overlay),
      messageList: place(dm._messageList),
      calendarColumn: place(dm._calendar.get_parent()),
    },
    constraints: qs._overlay.get_constraints(),
    captureContainer: dm._messageList._captureContainer,
  }
}

function assertNoModal(what) {
  assert(
    Main.actionMode === Shell.ActionMode.NORMAL,
    `${what}: actionMode is ${Main.actionMode}, not NORMAL`,
  )
  assert(Main.modalCount === 0, `${what}: modalCount ${Main.modalCount}`)
  assert(
    !global.stage.get_grab_actor?.(),
    `${what}: stage grab held by ${global.stage.get_grab_actor?.()}`,
  )
  assert(!Main.messageTray.bannerBlocked, `${what}: banners still blocked`)
}

function assertRestored(snap, what) {
  for (const [name, { actor, parent, index }] of Object.entries(snap.places)) {
    const now = place(actor)
    assert(now.parent === parent, `${what}: ${name} not back in its parent`)
    assert(
      now.index === index,
      `${what}: ${name} at index ${now.index}, was ${index}`,
    )
  }

  const constraints = qsMenu()._overlay.get_constraints()
  assert(
    constraints.length === snap.constraints.length &&
      constraints.every((c, i) => c === snap.constraints[i]),
    `${what}: overlay constraints not restored`,
  )
  assert(
    !Object.hasOwn(qsMenu(), '_setDimmed'),
    `${what}: _setDimmed override left on the quick settings menu`,
  )
  if (typeof dateMenu()._messageList.setCaptureContainer === 'function')
    assert(
      dateMenu()._messageList._captureContainer === snap.captureContainer,
      `${what}: message list capture container not restored`,
    )
  assert(
    !Main.uiGroup.get_children().some((a) => a._delegate?.qsHost),
    `${what}: action center menu left on stage`,
  )
  assertNoModal(what)
}

function secondaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isStandalone && !p.isPrimary)
}

async function secondarySource() {
  const panel = await waitFor(secondaryPanel)
  const container = await waitFor(() => {
    const c = panel.statusArea?.dateMenu?.container
    return c?.mapped && c.has_allocation() && c.width > 0 && c
  })
  return { panel, container }
}

function contains(ancestor, actor) {
  return !!ancestor && !!actor && ancestor.contains(actor)
}

function findLabel(actor, text) {
  if (actor instanceof St.Label && actor.text === text) return actor
  for (const child of actor.get_children()) {
    const found = findLabel(child, text)
    if (found) return found
  }
  return null
}

async function openOnSecondary(what) {
  const ac = ext().stateObj.actionCenter
  const { panel, container } = await secondarySource()
  ac.open(container)
  await waitFor(() => ac.isOpen)

  const boxPointer = ac.actor.get_first_child()
  await waitFor(() => boxPointer.mapped && boxPointer.width > 0)
  await sleep(200)

  // The work area lies within the monitor and excludes the bar.
  const index = panel.monitor.index
  const area = Main.layoutManager.getWorkAreaForMonitor(index)
  const [x, y] = boxPointer.get_transformed_position()
  const [w, h] = boxPointer.get_transformed_size()
  assert(
    x >= area.x &&
      y >= area.y &&
      x + w <= area.x + area.width &&
      y + h <= area.y + area.height,
    `${what}: popup ${x},${y} ${w}x${h} outside monitor ${index} work area`,
  )
  assert(
    Main.actionMode === Shell.ActionMode.POPUP,
    `${what}: open popup is not modal`,
  )
  return ac
}

function assertHosted(ac, what) {
  const qs = qsMenu()
  const dm = dateMenu()
  for (const [name, actor] of [
    ['grid', qs._grid],
    ['overlay', qs._overlay],
    ['message list', dm._messageList],
    ['calendar column', dm._calendar.get_parent()],
  ])
    assert(contains(ac.actor, actor), `${what}: ${name} not in action center`)
}

function addExternalIndicator() {
  const indicator = new QuickSettings.SystemIndicator()
  const toggle = new QuickSettings.QuickMenuToggle({ title: TEST_TITLE })
  toggle.menu.addMenuItem(new PopupMenu.PopupMenuItem(TEST_TITLE))
  indicator.quickSettingsItems.push(toggle)
  Main.panel.statusArea.quickSettings.addExternalIndicator(indicator)
  return { indicator, toggle }
}

function postNotification() {
  const source = new MessageTray.Source({
    title: TEST_TITLE,
    iconName: 'dialog-information-symbolic',
  })
  Main.messageTray.add(source)
  const notification = new MessageTray.Notification({
    source,
    title: TEST_TITLE,
    body: 'body',
  })
  source.addNotification(notification)
  return source
}

async function openSubmenu(ac, what) {
  const item = qsMenu()
    ._grid.get_children()
    .find((c) => c.menu)
  assert(item, `${what}: no quick toggle with a menu`)
  item.menu.open()
  await waitFor(() => item.menu.isOpen)
  assert(
    contains(ac.actor, item.menu.actor),
    `${what}: submenu not in action center overlay`,
  )
  assert(ac._menu._dimEffect.enabled, `${what}: action center not dimmed`)
  return item
}

// The stock overlay offsets must again track the stock boxpointer.
async function assertStockOverlayAligned() {
  const qs = qsMenu()
  qs.open()
  await waitFor(() => qs.isOpen && qs._grid.mapped)
  await sleep(300)

  const offset = qs._grid.apply_relative_transform_to_point(
    qs._boxPointer,
    new Graphene.Point3D(),
  )
  for (const c of qs._overlay.get_constraints()) {
    if (!(c instanceof Clutter.BindConstraint) || c.source !== qs._boxPointer)
      continue
    const axis = c.coordinate === Clutter.BindCoordinate.X ? 'x' : 'y'
    assert(
      Math.abs(c.offset - offset[axis]) < 0.5,
      `stock overlay ${axis} offset ${c.offset}, expected ${offset[axis]}`,
    )
  }
  qs.close()
  await waitFor(() => !qs.isOpen)
  await sleep(300)
  assertNoModal('stock quick settings closed')
}

export async function run() {
  assert(MONITORS === 2, 'actionCenter needs --monitors 2')

  Main.overview.hide()
  await waitFor(() => !Main.overview.visible)
  await waitFor(() => qsMenu()._grid.get_n_children() > 1, 10000)
  const snap = snapshot()
  assertNoModal('before enable')

  await enable()
  let ac = await openOnSecondary('first open')
  assertHosted(ac, 'first open')

  const external = addExternalIndicator()
  await waitFor(() => contains(ac.actor, external.toggle))
  assert(
    contains(ac.actor, external.toggle.menu.actor),
    'late submenu not in action center overlay',
  )

  const source = postNotification()
  await waitFor(() => findLabel(dateMenu()._messageList, TEST_TITLE))

  await openSubmenu(ac, 'submenu')
  await disable()
  assertRestored(snap, 'disable with submenu open')
  assert(
    external.toggle.get_parent() === qsMenu()._grid,
    'external toggle not back in the stock grid',
  )
  await assertStockOverlayAligned()

  for (let i = 0; i < 5; i++) {
    const what = `cycle ${i + 1}`
    await enable()
    ac = await openOnSecondary(what)
    assertHosted(ac, what)
    if (i % 2) await openSubmenu(ac, what)
    await disable()
    assertRestored(snap, what)
  }

  await enable()
  ac = ext().stateObj.actionCenter
  assertHosted(ac, 'final enable')
  external.toggle.destroy()
  external.indicator.destroy()
  source.destroy()
  await sleep(200)
  assertNoModal('final')

  done('actionCenter')
}
