import Shell from 'gi://Shell'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js'

import {
  assert,
  captureStage,
  disable,
  done,
  enable,
  ext,
  sleep,
  waitFor,
} from '../lib.js'

const N_NOTIFICATIONS = 6
// Rounding of scaled lengths and the popup's own CSS margin.
const SLACK = 2

const ac = () => ext().stateObj.actionCenter
const qsMenu = () => Main.panel.statusArea.quickSettings.menu
const boxPointer = () => ac().actor.get_first_child()
const menu = () => ac()._menu

function usable(actor) {
  return actor?.mapped && actor.has_allocation() && actor.width > 0
}

function postNotifications(n) {
  const sources = []
  for (let i = 0; i < n; i++) {
    const source = new MessageTray.Source({
      title: `Cornerstone layout test ${i + 1}`,
      iconName: 'dialog-information-symbolic',
    })
    Main.messageTray.add(source)
    source.addNotification(
      new MessageTray.Notification({
        source,
        title: `Notification ${i + 1}`,
        body: 'A body long enough to wrap onto a second line in the list.',
        resident: true,
      }),
    )
    sources.push(source)
  }
  return sources
}

function height(actor) {
  return actor.get_transformed_size()[1]
}

function natural(actor) {
  return actor.get_preferred_height(actor.width)[1]
}

function box(actor) {
  const [x, y] = actor.get_transformed_position()
  const [w, h] = actor.get_transformed_size()
  return { x, y, w, h }
}

function measure() {
  const m = menu()
  const area = Main.layoutManager.getWorkAreaForMonitor(
    Main.layoutManager.findIndexForActor(ac()._source),
  )
  const metrics = {
    workArea: area.height,
    popup: height(boxPointer()),
    content: box(m.content),
    qs: box(m.qsHost),
    messages: box(m.messagesHost),
    calendar: box(m.calendarHost),
    calendarNatural: natural(m.calendarHost),
  }
  console.log(`[cornerstone-test] layout ${JSON.stringify(metrics)}`)
  return metrics
}

// Quick settings across the top, notifications and calendar side by side
// below, the popup within the work area.
function assertLayout(what, metrics, { swapped = false } = {}) {
  const { workArea, popup, content, qs, messages, calendar } = metrics
  assert(popup <= workArea, `${what}: popup ${popup} taller than ${workArea}`)
  assert(
    Math.abs(qs.w - content.w) <= SLACK,
    `${what}: quick settings ${qs.w} wide, content ${content.w}`,
  )
  assert(
    messages.y >= qs.y + qs.h && calendar.y >= qs.y + qs.h,
    `${what}: columns are not below the quick settings`,
  )
  assert(
    Math.abs(messages.y - calendar.y) <= SLACK,
    `${what}: columns do not start at the same height`,
  )
  const [left, right] = swapped ? [calendar, messages] : [messages, calendar]
  assert(
    left.x + left.w <= right.x + SLACK,
    `${what}: columns overlap or are in the wrong order`,
  )
  assert(
    Math.abs(calendar.h - metrics.calendarNatural) <= SLACK ||
      calendar.h >= metrics.calendarNatural,
    `${what}: calendar ${calendar.h}, natural ${metrics.calendarNatural}`,
  )
}

async function openAndMeasure(what) {
  Main.panel.toggleCalendar()
  await waitFor(() => ac().isOpen && usable(boxPointer()))
  await sleep(600)
  assert(
    Main.actionMode === Shell.ActionMode.POPUP,
    `${what}: popup is not modal`,
  )
  return measure()
}

async function close() {
  Main.panel.closeCalendar()
  await waitFor(() => !ac().isOpen && !ac().actor.visible)
}

export async function run() {
  Main.overview.hide()
  await waitFor(() => !Main.overview.visible)
  await waitFor(() => qsMenu()._grid.get_n_children() > 1, 10000)

  await enable()
  await waitFor(() => ext().stateObj.oneButton?.isActive)
  await sleep(500)
  const settings = ext().stateObj.getSettings()

  const sources = postNotifications(N_NOTIFICATIONS)
  await waitFor(
    () =>
      Main.messageTray._notificationState === MessageTray.State.SHOWN ||
      Main.messageTray.queueCount === 0,
    10000,
  )

  assertLayout('with notifications', await openAndMeasure('notifications'))
  await captureStage('ac-notifications')
  await close()

  for (const source of sources) source.destroy()
  await sleep(500)

  assertLayout('without notifications', await openAndMeasure('empty'))
  await captureStage('ac-empty')
  await close()

  settings.set_int('action-center-width', 1000)
  settings.set_boolean('action-center-swap', true)
  const wide = await openAndMeasure('wide and swapped')
  assertLayout('wide and swapped', wide, { swapped: true })
  assert(
    Math.abs(wide.content.w - 1000) <= SLACK,
    `width setting: content ${wide.content.w} wide, want 1000`,
  )
  await captureStage('ac-wide-swapped')
  await close()
  settings.reset('action-center-width')
  settings.reset('action-center-swap')

  settings.set_strv('action-center-hidden-sections', [
    'events',
    'world-clocks',
    'weather',
    'quick-settings',
  ])
  await openAndMeasure('sections hidden')
  const m = menu()
  assert(!m.qsHost.visible, 'quick settings hidden')
  assert(m.calendarHost.visible, 'calendar still shown')
  const dateMenu = Main.panel.statusArea.dateMenu
  assert(!dateMenu._weatherItem.mapped, 'weather hidden')
  assert(dateMenu._calendar.mapped, 'month grid shown')
  await captureStage('ac-sections')
  await close()
  settings.reset('action-center-hidden-sections')

  await disable()
  assert(
    dateMenu._weatherItem.get_parent() !== null &&
      !ac(),
    'weather back in the date menu after disable',
  )
  await enable()
  done('acLayout')
}
