import Shell from 'gi://Shell'
import St from 'gi://St'

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

// The actor of the column holding `id`: its scroll view when it has one.
function columnOf(id) {
  const box = menu().blockHosts[id].get_parent()
  return box?.get_parent() instanceof St.ScrollView ? box.get_parent() : box
}

function measure() {
  const m = menu()
  const area = Main.layoutManager.getWorkAreaForMonitor(
    Main.layoutManager.findIndexForActor(ac()._source),
  )
  const calendarBox = m.blockHosts.calendar.get_parent()
  const metrics = {
    workArea: area.height,
    popup: height(boxPointer()),
    content: box(m.content),
    qs: box(m.blockHosts['quick-settings']),
    messages: box(m.blockHosts.notifications),
    calendar: box(columnOf('calendar')),
    calendarNatural: natural(calendarBox),
  }
  console.log(`[cornerstone-test] layout ${JSON.stringify(metrics)}`)
  return metrics
}

// The three groups of the old fixed layout, as layout columns.
const GROUPS = {
  qs: { width: 'fill', valign: 'start', blocks: ['quick-settings'] },
  messages: { width: 'fill', valign: 'fill', blocks: ['notifications'] },
  calendar: {
    width: 'fit',
    valign: 'start',
    blocks: ['today', 'calendar', 'events', 'world-clocks', 'weather'],
  },
}

// Rows of group names as an action-center-layout value.
function layoutOf(rows, align = 'center') {
  return JSON.stringify({
    rows: rows.map((names) => ({
      align,
      columns: names.map((name) => GROUPS[name]),
    })),
  })
}

// `rows` of group names: the first across the top, the other two side by
// side below, in order; the popup within the work area.
function assertLayout(what, metrics, rows) {
  const [[topName], [leftName, rightName]] = rows
  const { workArea, popup, content } = metrics
  const [top, left, right] = [topName, leftName, rightName].map(
    (name) => metrics[name],
  )
  assert(popup <= workArea, `${what}: popup ${popup} taller than ${workArea}`)
  if (topName === 'calendar') {
    // Alone on its row the calendar keeps its width, in the middle.
    const middle = top.x + top.w / 2
    assert(
      Math.abs(middle - (content.x + content.w / 2)) <= SLACK,
      `${what}: calendar centred at ${middle}, content ${content.x}+${content.w}`,
    )
  } else {
    assert(
      Math.abs(top.w - content.w) <= SLACK,
      `${what}: ${topName} ${top.w} wide, content ${content.w}`,
    )
  }
  assert(
    left.y >= top.y + top.h && right.y >= top.y + top.h,
    `${what}: ${leftName} and ${rightName} are not below ${topName}`,
  )
  assert(
    Math.abs(left.y - right.y) <= SLACK,
    `${what}: columns do not start at the same height`,
  )
  assert(
    left.x + left.w <= right.x + SLACK,
    `${what}: ${leftName} not left of ${rightName}`,
  )
  assert(
    metrics.calendar.h >= metrics.calendarNatural - SLACK,
    `${what}: calendar ${metrics.calendar.h}, natural ${metrics.calendarNatural}`,
  )
}

// The toggle submenus open over the grid, wherever the layout put it.
function assertOverlayOnGrid(what) {
  const overlay = qsMenu()._overlay
  const [gx, gy] = qsMenu()._grid.get_transformed_position()
  const [ox, oy] = overlay.get_transformed_position()
  assert(
    Math.abs(gx - ox) <= SLACK && Math.abs(gy - oy) <= SLACK,
    `${what}: overlay at ${ox},${oy}, grid at ${gx},${gy}`,
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

  const DEFAULT = [['qs'], ['messages', 'calendar']]
  assertLayout(
    'with notifications',
    await openAndMeasure('notifications'),
    DEFAULT,
  )
  await captureStage('ac-notifications')
  await close()

  for (const source of sources) source.destroy()
  await sleep(500)

  assertLayout('without notifications', await openAndMeasure('empty'), DEFAULT)
  await captureStage('ac-empty')
  await close()

  const SWAPPED = [['qs'], ['calendar', 'messages']]
  settings.set_int('action-center-width', 1000)
  settings.set_string('action-center-layout', layoutOf(SWAPPED))
  const wide = await openAndMeasure('wide and swapped')
  assertLayout('wide and swapped', wide, SWAPPED)
  assert(
    Math.abs(wide.content.w - 1000) <= SLACK,
    `width setting: content ${wide.content.w} wide, want 1000`,
  )
  await captureStage('ac-wide-swapped')
  await close()
  settings.reset('action-center-width')

  for (const rows of [
    [['messages'], ['calendar', 'qs']],
    [['messages'], ['qs', 'calendar']],
    [['calendar'], ['messages', 'qs']],
    [['calendar'], ['qs', 'messages']],
  ]) {
    const what = rows.flat().join(', ')
    settings.set_string('action-center-layout', layoutOf(rows))
    assertLayout(what, await openAndMeasure(what), rows)
    assertOverlayOnGrid(what)
    await captureStage(`ac-${rows.flat().join('-')}`)
    await close()
  }

  // Three columns side by side.
  settings.set_string(
    'action-center-layout',
    layoutOf([['calendar', 'messages', 'qs']]),
  )
  {
    const m = await openAndMeasure('three columns')
    assert(
      Math.abs(m.calendar.y - m.messages.y) <= SLACK &&
        Math.abs(m.messages.y - m.qs.y) <= SLACK,
      'three columns: not on one row',
    )
    assert(
      m.calendar.x + m.calendar.w <= m.messages.x + SLACK &&
        m.messages.x + m.messages.w <= m.qs.x + SLACK,
      'three columns: not left to right',
    )
    assertOverlayOnGrid('three columns')
    await captureStage('ac-three-columns')
    await close()
  }

  // A fitted row docked right, a block centred in a stretched column, and
  // the grid scrolled with the calendar in one column.
  settings.set_int('action-center-width', 1000)
  settings.set_string(
    'action-center-layout',
    JSON.stringify({
      rows: [
        {
          align: 'end',
          columns: [{ width: 'fit', blocks: ['calendar'] }],
        },
        {
          columns: [
            {
              width: 'fill',
              blocks: [{ id: 'today', align: 'center' }, 'quick-settings'],
            },
            { width: 'fill', valign: 'fill', blocks: ['notifications'] },
          ],
        },
      ],
    }),
  )
  {
    const m = await openAndMeasure('docked and centred')
    const calendar = box(columnOf('calendar'))
    assert(
      Math.abs(calendar.x + calendar.w - (m.content.x + m.content.w)) <= SLACK,
      `docked right: calendar ends at ${calendar.x + calendar.w}, content at ${m.content.x + m.content.w}`,
    )
    const today = box(menu().blockHosts.today)
    const column = box(columnOf('today'))
    assert(
      Math.abs(today.x + today.w / 2 - (column.x + column.w / 2)) <= SLACK &&
        today.w < column.w - SLACK,
      `centred: today ${today.x}+${today.w}, column ${column.x}+${column.w}`,
    )
    assertOverlayOnGrid('grid below today')
    await captureStage('ac-docked')
    await close()
  }
  settings.reset('action-center-width')
  settings.reset('action-center-layout')
  assertLayout('back to the default', await openAndMeasure('back'), DEFAULT)
  assertOverlayOnGrid('back to the default')
  await close()

  // Blocks left out of the layout are hidden.
  settings.set_string(
    'action-center-layout',
    JSON.stringify({
      rows: [{ columns: [{ blocks: ['notifications', 'today', 'calendar'] }] }],
    }),
  )
  await openAndMeasure('blocks hidden')
  const m = menu()
  const dateMenu = Main.panel.statusArea.dateMenu
  assert(!m.blockHosts['quick-settings'].mapped, 'quick settings hidden')
  assert(!dateMenu._weatherItem.mapped, 'weather hidden')
  assert(dateMenu._calendar.mapped, 'month grid shown')
  await captureStage('ac-blocks-hidden')
  await close()

  // Disabled with blocks hidden: every widget back in the date menu.
  await disable()
  for (const [name, actor, home] of [
    ['today', dateMenu._date, dateMenu.menu.box],
    ['calendar', dateMenu._calendar, dateMenu.menu.box],
    ['weather', dateMenu._weatherItem, dateMenu.menu.box],
    ['grid', qsMenu()._grid, qsMenu().box],
  ])
    assert(home.contains(actor), `${name} not back in GNOME after disable`)
  assert(
    dateMenu._date.get_next_sibling() === dateMenu._calendar,
    'today above the month grid again',
  )
  assert(!ac(), 'action center gone')
  settings.reset('action-center-layout')
  await enable()
  done('acLayout')
}
