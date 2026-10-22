import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import Shell from 'gi://Shell'
import St from 'gi://St'

import * as Config from 'resource:///org/gnome/shell/misc/config.js'
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js'

import {
  useClassicLayout,
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

const TEST_TITLE = 'Cornerstone routing test'
const DISPOSED = /already disposed/
const NAN = /isnan|\bNaN\b/
const PANEL_OVERRIDES = [
  'toggleCalendar',
  'toggleQuickSettings',
  'closeCalendar',
  'closeQuickSettings',
]

// status/system.js closes this way before a screenshot.
const NO_ANIMATION =
  parseInt(Config.PACKAGE_VERSION, 10) >= 51
    ? { animate: false }
    : BoxPointer.PopupAnimation.NONE

const ac = () => ext().stateObj.actionCenter
const settings = () => ext().stateObj.getSettings()
const qsMenu = () => Main.panel.statusArea.quickSettings.menu
const boxPointer = () => ac().actor.get_first_child()

function secondaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isStandalone && !p.isPrimary)
}

function usable(actor) {
  return actor?.mapped && actor.has_allocation() && actor.width > 0 && actor
}

// Kept for the whole run: a collected virtual device is removed.
let pointer = null

// Clutter.get_default_backend() is gone in 51.
function seat() {
  const backend =
    global.stage.context?.get_backend?.() ?? Clutter.get_default_backend()
  return backend.get_default_seat()
}

function monitorCenter(index) {
  const m = Main.layoutManager.monitors[index]
  return [m.x + Math.floor(m.width / 2), m.y + Math.floor(m.height / 2)]
}

function virtualPointer() {
  pointer ??= seat().create_virtual_device(
    Clutter.InputDeviceType.POINTER_DEVICE,
  )
  return pointer
}

// warp_pointer does nothing in a headless 51 shell; a virtual device moves.
async function warpTo(index) {
  const [x, y] = monitorCenter(index)
  virtualPointer().notify_absolute_motion(GLib.get_monotonic_time(), x, y)
  await waitFor(() => {
    const [px, py] = global.get_pointer()
    return Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1
  })
}

async function clickActor(actor) {
  virtualPointer()
  const [x, y] = actor.get_transformed_position()
  const [w, h] = actor.get_transformed_size()
  const now = () => GLib.get_monotonic_time()
  pointer.notify_absolute_motion(now(), x + w / 2, y + h / 2)
  await sleep(150)
  pointer.notify_button(
    now(),
    Clutter.BUTTON_PRIMARY,
    Clutter.ButtonState.PRESSED,
  )
  await sleep(50)
  pointer.notify_button(
    now(),
    Clutter.BUTTON_PRIMARY,
    Clutter.ButtonState.RELEASED,
  )
  await sleep(150)
}

function assertNoModal(what) {
  assert(
    Main.actionMode === Shell.ActionMode.NORMAL,
    `${what}: actionMode is ${Main.actionMode}, not NORMAL`,
  )
  assert(Main.modalCount === 0, `${what}: modalCount ${Main.modalCount}`)
  assert(!Main.messageTray.bannerBlocked, `${what}: banners still blocked`)
}

function sourceMonitor() {
  return Main.layoutManager.findIndexForActor(ac()._source)
}

function assertInside(rect, what, label) {
  const [x, y] = boxPointer().get_transformed_position()
  const [w, h] = boxPointer().get_transformed_size()
  assert(
    x >= rect.x &&
      y >= rect.y &&
      x + w <= rect.x + rect.width &&
      y + h <= rect.y + rect.height,
    `${what}: popup ${x},${y} ${w}x${h} outside ${label} ` +
      `${rect.x},${rect.y} ${rect.width}x${rect.height}`,
  )
}

async function expectOpen(what, monitor) {
  await waitFor(() => ac().isOpen)
  await waitFor(() => usable(boxPointer()))
  await sleep(450)
  assert(
    Main.actionMode === Shell.ActionMode.POPUP,
    `${what}: popup is not modal`,
  )
  if (monitor !== undefined) {
    assert(
      sourceMonitor() === monitor,
      `${what}: source on monitor ${sourceMonitor()}, expected ${monitor}`,
    )
    assertInside(
      Main.layoutManager.getWorkAreaForMonitor(monitor),
      what,
      `monitor ${monitor} work area`,
    )
  }
  for (const button of ['dateMenu', 'quickSettings'])
    for (const statusArea of [
      Main.panel.statusArea,
      secondaryPanel()?.statusArea,
    ])
      assert(
        !statusArea?.[button]?.menu.isOpen,
        `${what}: stock ${button} menu opened`,
      )
}

async function expectClosed(what) {
  await waitFor(() => !ac().isOpen && !ac().actor.visible)
  await sleep(100)
  assertNoModal(what)
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
    resident: true,
  })
  const activated = { count: 0 }
  notification.connect('activated', () => activated.count++)
  source.addNotification(notification)
  const posted = { source, notification, activated, gone: false }
  source.connect('destroy', () => (posted.gone = true))
  return posted
}

// A source goes away by itself with its last notification.
function removeSource(posted) {
  if (!posted.gone) posted.source.destroy()
}

async function shownBanner(notification) {
  return waitFor(() => {
    const tray = Main.messageTray
    const banner = tray._banner
    return (
      tray._notificationState === MessageTray.State.SHOWN &&
      banner?.notification === notification &&
      usable(banner) &&
      banner
    )
  }, 10000)
}

async function bannerClick() {
  const posted = postNotification()
  const banner = await shownBanner(posted.notification)
  const monitor = Main.layoutManager.findIndexForActor(banner)
  await clickActor(banner)
  return { ...posted, banner, monitor }
}

function overridden(snapshot) {
  return snapshot.filter(([obj, name]) => Object.hasOwn(obj, name))
}

export async function run() {
  useClassicLayout()
  assert(MONITORS === 2, 'routing needs --monitors 2')

  Main.overview.hide()
  await waitFor(() => !Main.overview.visible)
  await waitFor(() => qsMenu()._grid.get_n_children() > 1, 10000)
  const stockToggle = Main.panel.toggleCalendar
  assert(
    !Object.hasOwn(Main.panel, 'toggleCalendar'),
    'toggleCalendar is inherited before enable',
  )

  await enable()
  let panel = await waitFor(secondaryPanel)
  await waitFor(() => usable(panel.statusArea.dateMenu))
  const secondary = panel.monitor.index
  const primary = Main.layoutManager.primaryIndex
  assert(secondary !== primary, 'secondary bar on the primary monitor')

  // Keyboard shortcuts open on the monitor under the pointer.
  await warpTo(secondary)
  Main.panel.toggleCalendar()
  await expectOpen('toggleCalendar', secondary)
  Main.panel.closeCalendar()
  await expectClosed('closeCalendar')

  Main.panel.toggleQuickSettings()
  await expectOpen('toggleQuickSettings', secondary)
  Main.panel.toggleQuickSettings()
  await expectClosed('toggleQuickSettings again')

  Main.panel.toggleQuickSettings()
  await expectOpen('toggleQuickSettings reopen', secondary)
  qsMenu().close()
  await expectClosed('quickSettings.menu.close')

  // run.sh turns animations off, which would hide a dropped argument.
  const desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' })
  desktop.set_boolean('enable-animations', true)
  await waitFor(() => St.Settings.get().enable_animations)
  Main.panel.toggleQuickSettings()
  await expectOpen('before close without animation', secondary)
  qsMenu().close(NO_ANIMATION)
  const leftVisible = ac().actor.visible
  desktop.set_boolean('enable-animations', false)
  assert(!ac().isOpen, 'close without animation left the popup open')
  assert(!leftVisible, 'close without animation faded the popup out')
  await expectClosed('quickSettings.menu.close without animation')
  await waitFor(() => !St.Settings.get().enable_animations)

  Main.panel.toggleQuickSettings()
  await expectOpen('before closeQuickSettings', secondary)
  Main.panel.closeQuickSettings()
  await expectClosed('closeQuickSettings')

  await warpTo(primary)
  Main.panel.toggleCalendar()
  await expectOpen('toggleCalendar on primary', primary)
  Main.panel.closeCalendar()
  await expectClosed('closeCalendar on primary')

  // Bar buttons, called and clicked.
  const secondaryDate = panel.statusArea.dateMenu
  secondaryDate.menu.toggle()
  await expectOpen('secondary dateMenu toggle', secondary)
  assert(ac()._source === secondaryDate, 'source is the secondary clock')
  secondaryDate.menu.toggle()
  await expectClosed('secondary dateMenu toggle again')

  await clickActor(secondaryDate)
  await expectOpen('secondary clock click', secondary)
  Main.panel.closeCalendar()
  await expectClosed('after secondary clock click')

  const mirror = await waitFor(() => usable(panel.statusArea.quickSettings.container.get_child()?.child))
  await clickActor(mirror)
  await expectOpen('quick settings mirror click', secondary)
  assert(ac()._source === mirror, 'source is the quick settings mirror')
  Main.panel.closeQuickSettings()
  await expectClosed('after mirror click')

  await clickActor(Main.panel.statusArea.dateMenu)
  await expectOpen('primary clock click', primary)
  Main.panel.closeCalendar()
  await expectClosed('after primary clock click')

  Main.panel.statusArea.quickSettings.menu.open()
  await expectOpen('primary quick settings open()', primary)
  Main.panel.closeQuickSettings()
  await expectClosed('after primary quick settings open()')

  // Banner click opens the Action Center instead of activating.
  let click = await bannerClick()
  await expectOpen('banner click', click.monitor)
  assert(click.activated.count === 0, 'banner click activated the notification')
  Main.panel.closeCalendar()
  await expectClosed('after banner click')
  removeSource(click)

  // The banner's own close button still closes the notification.
  const posted = postNotification()
  let destroyed = false
  posted.notification.connect('destroy', () => (destroyed = true))
  const banner = await shownBanner(posted.notification)
  const closeButton = await waitFor(() => usable(banner._header.closeButton))
  await clickActor(closeButton)
  await waitFor(() => destroyed)
  assert(!ac().isOpen, 'banner close button opened the Action Center')
  assert(posted.activated.count === 0, 'close button activated')
  removeSource(posted)
  await sleep(300)
  assertNoModal('after banner close button')

  settings().set_string('action-center-banner-click', 'activate')
  click = await bannerClick()
  await waitFor(() => click.activated.count === 1)
  assert(!ac().isOpen, 'activate setting still opened the Action Center')
  removeSource(click)
  settings().reset('action-center-banner-click')
  await sleep(300)
  assertNoModal('after activate setting')

  // dash-to-panel rebuilds its panels while the popup is open.
  await warpTo(secondary)
  Main.panel.toggleCalendar()
  await expectOpen('before reset', secondary)
  const beforeReset = panel
  beforeReset.panelManager._reset()
  panel = await waitFor(() => {
    const p = secondaryPanel()
    return p && p !== beforeReset && usable(p.statusArea.dateMenu) && p
  })
  await expectClosed('after reset')
  Main.panel.toggleCalendar()
  await expectOpen('reopen after reset', secondary)
  assert(
    panel.panelBox.contains(ac()._source),
    'reopened at a button of the rebuilt panel',
  )
  Main.panel.closeCalendar()
  await expectClosed('closed after reset')
  panel.statusArea.dateMenu.menu.toggle()
  await expectOpen('rebuilt secondary clock', secondary)
  Main.panel.closeCalendar()
  await expectClosed('rebuilt secondary clock closed')

  // Vertical secondary bar on the left.
  settings().set_string(
    'panel-positions',
    JSON.stringify({ [secondary]: 'LEFT' }),
  )
  panel = await waitFor(() => {
    const p = secondaryPanel()
    return p?.checkIfVertical() && usable(p.statusArea.dateMenu) && p
  })
  await sleep(500)
  Main.panel.toggleCalendar()
  await expectOpen('vertical bar', secondary)
  assert(
    boxPointer()._userArrowSide === St.Side.LEFT,
    `vertical bar: arrow side ${boxPointer()._userArrowSide}`,
  )
  const geometry = Main.layoutManager.monitors[secondary]
  assertInside(geometry, 'vertical bar', `monitor ${secondary}`)
  Main.panel.closeCalendar()
  await expectClosed('vertical bar closed')
  settings().set_string('panel-positions', '{}')
  panel = await waitFor(() => {
    const p = secondaryPanel()
    return p && !p.checkIfVertical() && usable(p.statusArea.dateMenu) && p
  })

  // Disable less than a dim animation after a submenu closed.
  Main.panel.toggleQuickSettings()
  await expectOpen('submenu race', secondary)
  const item = qsMenu()
    ._grid.get_children()
    .find((c) => c.menu)
  item.menu.open()
  await waitFor(() => item.menu.isOpen)
  await sleep(450)
  item.menu.close()

  const watched = [
    ...PANEL_OVERRIDES.map((name) => [Main.panel, name]),
    [qsMenu(), 'close'],
  ]
  for (const statusArea of [Main.panel.statusArea, panel.statusArea])
    for (const role of ['dateMenu', 'quickSettings'])
      for (const name of ['toggle', 'open'])
        watched.push([statusArea[role].menu, name])
  assert(
    overridden(watched).length === watched.length,
    'every routed method is overridden while enabled',
  )

  await disable()
  const left = overridden(watched).map(([, name]) => name)
  assert(!left.length, `own-property overrides left: ${left.join(', ')}`)
  assert(
    Main.panel.toggleCalendar === stockToggle,
    'toggleCalendar is the original function again',
  )
  assertNoModal('after disable')

  // GNOME's own calendar is back.
  Main.panel.toggleCalendar()
  await waitFor(() => Main.panel.statusArea.dateMenu.menu.isOpen)
  Main.panel.closeCalendar()
  await waitFor(() => !Main.panel.statusArea.dateMenu.menu.isOpen)
  await sleep(500)
  assertNoModal('stock calendar closed')

  await sleep(500)
  const disposed = logLines(DISPOSED)
  assert(!disposed.length, `already disposed: ${disposed.join(' | ')}`)
  const nan = logLines(NAN)
  assert(!nan.length, `NaN allocations: ${nan.join(' | ')}`)

  await enable()
  done('routing')
}
