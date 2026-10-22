/*
 * The tray layout model: per monitor, the order of the tray icons, the bar
 * box each one sits in and whether it is shown, in the overflow or hidden.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <https://www.gnu.org/licenses/>.
 */

export const TRAY_KEY = 'tray-layout'
export const BOXES = ['left', 'center', 'right']
export const STATES = ['shown', 'overflow', 'hidden']
// The overflow button's item: placed like an icon, always shown.
export const OVERFLOW_ROLE = 'cornerstone:overflow'

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function validItem(item) {
  return (
    isPlainObject(item) &&
    typeof item.role === 'string' &&
    BOXES.includes(item.box) &&
    STATES.includes(item.state)
  )
}

const reported = new Set()

// { monitorKey: [{ role, box, state }, ...] }; invalid parts are dropped.
export function readTrayLayout(settings) {
  const raw = settings.get_string(TRAY_KEY)
  let value
  try {
    value = JSON.parse(raw)
  } catch (e) {
    if (!reported.has(raw)) {
      reported.add(raw)
      console.error(`[cornerstone] tray: invalid JSON in ${TRAY_KEY}`, e)
    }
    return {}
  }
  if (!isPlainObject(value)) return {}

  const layout = {}
  for (const [key, items] of Object.entries(value))
    if (Array.isArray(items)) layout[key] = items.filter(validItem)
  return layout
}

export function writeTrayItems(settings, key, items) {
  const layout = readTrayLayout(settings)
  layout[key] = items.map(({ role, box, state }) => ({ role, box, state }))
  settings.set_string(TRAY_KEY, JSON.stringify(layout))
}

export function resetTrayItems(settings, key) {
  const layout = readTrayLayout(settings)
  delete layout[key]
  settings.set_string(TRAY_KEY, JSON.stringify(layout))
}

// The items for one monitor. `sources` lists the tray icons present now,
// in GNOME's order, with the box GNOME put them in. Saved items come first
// in their saved order; icons never saved follow, shown unless
// `defaultState(role)` says otherwise. Saved icons no longer present are
// left out but stay saved. The overflow is always there: where it was
// saved, else first in the right box.
export function planTray(sources, saved = [], defaultState = () => 'shown') {
  const present = new Set([...sources.map((s) => s.role), OVERFLOW_ROLE])
  const items = []
  const seen = new Set()
  for (const item of saved) {
    if (!present.has(item.role) || seen.has(item.role)) continue
    seen.add(item.role)
    const state = item.role === OVERFLOW_ROLE ? 'shown' : item.state
    items.push({ role: item.role, box: item.box, state })
  }
  for (const { role, box } of sources) {
    if (seen.has(role)) continue
    seen.add(role)
    items.push({ role, box, state: defaultState(role) })
  }
  if (!seen.has(OVERFLOW_ROLE)) {
    const right = items.findIndex((item) => item.box === 'right')
    items.splice(right < 0 ? items.length : right, 0, {
      role: OVERFLOW_ROLE,
      box: 'right',
      state: 'shown',
    })
  }
  return items
}

// Saved items with the icons not present now kept in place, so editing one
// monitor's present icons does not forget the others.
export function mergeTrayItems(saved = [], edited) {
  const editedRoles = new Set(edited.map((item) => item.role))
  const absent = saved.filter((item) => !editedRoles.has(item.role))
  return [...edited, ...absent]
}

// Gives the monitors `to` the layout of `from`: its `items` as planned
// now, and its saved icons absent now.
export function copyTrayItems(settings, from, to, items) {
  const layout = readTrayLayout(settings)
  const copied = mergeTrayItems(layout[from], items).map(
    ({ role, box, state }) => ({ role, box, state }),
  )
  for (const key of to) layout[key] = copied
  settings.set_string(TRAY_KEY, JSON.stringify(layout))
}

export function itemsInBox(items, box, state = 'shown') {
  return items.filter((item) => item.box === box && item.state === state)
}

// Moves `role` to `index` among the items of `box` (all states), and into
// that box.
export function moveTrayItem(items, role, box, index) {
  const item = items.find((i) => i.role === role)
  if (!item) return items

  const rest = items.filter((i) => i !== item)
  const moved = { ...item, box }
  const inBox = rest.filter((i) => i.box === box)
  const clamped = Math.max(0, Math.min(index, inBox.length))
  const anchor = inBox[clamped]
  const at = anchor ? rest.indexOf(anchor) : rest.length
  rest.splice(at, 0, moved)
  return rest
}

export function setTrayItemState(items, role, state) {
  return items.map((item) =>
    item.role === role ? { ...item, state } : item,
  )
}
