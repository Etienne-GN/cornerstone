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
      title: `Omnibar layout test ${i + 1}`,
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

function measure() {
  const m = menu()
  const area = Main.layoutManager.getWorkAreaForMonitor(
    Main.layoutManager.primaryIndex,
  )
  const bp = boxPointer()
  const metrics = {
    workArea: area.height,
    margins: bp.margin_top + bp.margin_bottom,
    popup: height(bp),
    content: height(m.content),
    qs: height(m.qsHost),
    qsNatural: natural(m.qsHost),
    messages: height(m.messagesHost),
    calendar: height(m.calendarHost),
    calendarNatural: natural(m.calendarHost),
  }
  console.log(`[omnibar-test] layout ${JSON.stringify(metrics)}`)
  return metrics
}

function assertLayout(what, metrics) {
  const { workArea, margins, popup, qs, qsNatural, calendar } = metrics
  assert(
    popup >= workArea - margins - SLACK && popup <= workArea,
    `${what}: popup height ${popup}, work area ${workArea} margins ${margins}`,
  )
  assert(
    Math.abs(qs - qsNatural) <= SLACK,
    `${what}: quick settings ${qs}, natural ${qsNatural}`,
  )
  assert(
    Math.abs(calendar - metrics.calendarNatural) <= SLACK,
    `${what}: calendar ${calendar}, natural ${metrics.calendarNatural}`,
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

export async function run() {
  Main.overview.hide()
  await waitFor(() => !Main.overview.visible)
  await waitFor(() => qsMenu()._grid.get_n_children() > 1, 10000)

  await enable()
  await waitFor(() => usable(Main.panel.statusArea.dateMenu))
  await sleep(500)

  const sources = postNotifications(N_NOTIFICATIONS)
  await waitFor(
    () =>
      Main.messageTray._notificationState === MessageTray.State.SHOWN ||
      Main.messageTray.queueCount === 0,
    10000,
  )

  const full = await openAndMeasure('with notifications')
  await captureStage('ac-notifications')
  Main.panel.closeCalendar()
  await waitFor(() => !ac().isOpen && !ac().actor.visible)

  for (const source of sources) source.destroy()
  await sleep(500)

  const empty = await openAndMeasure('without notifications')
  await captureStage('ac-empty')
  Main.panel.closeCalendar()
  await waitFor(() => !ac().isOpen && !ac().actor.visible)

  assertLayout('with notifications', full)
  assertLayout('without notifications', empty)
  const rest = full.content - full.qs - full.calendar
  assert(
    full.messages >= rest - 2 * 12 - SLACK,
    `with notifications: message list ${full.messages}, remaining ${rest}`,
  )

  await disable()
  await enable()
  done('acLayout')
}
