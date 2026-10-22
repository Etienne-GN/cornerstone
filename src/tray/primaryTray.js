/*
 * Arranges the real tray icons of GNOME's top bar: order, box, and the
 * icons moved out of the bar (overflowed or hidden).
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

import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import { WidgetMover } from '../actionCenter/widgetMover.js'
import { roleForChild } from '../mirror/plan.js'
import { BOXES, OVERFLOW_ROLE } from './layout.js'

export const BOX_ACTORS = {
  left: '_leftBox',
  center: '_centerBox',
  right: '_rightBox',
}

export class PrimaryTray {
  constructor() {
    this._mover = new WidgetMover()
    // role -> { box, rank, child }: where the icon was first seen.
    this._origins = new Map()
    // Icons out of the bar stay on stage, hidden, so their mirrors (in an
    // overflow popup, or on other monitors) still paint.
    this._holder = new St.Widget({ visible: false })
    Main.uiGroup.add_child(this._holder)
  }

  get holder() {
    return this._holder
  }

  // The top bar's tray icons in GNOME's order, each with the box GNOME put
  // it in and the actor holding it.
  sources() {
    const statusArea = Main.panel.statusArea
    for (const box of BOXES) {
      const children = Main.panel[BOX_ACTORS[box]]?.get_children() ?? []
      children.forEach((child, rank) => {
        const role = roleForChild(child, statusArea)
        if (!role) return
        const known = this._origins.get(role)
        if (known?.indicator === statusArea[role]) return
        if (known) this._forget(role)
        this._origins.set(role, {
          box,
          rank,
          child,
          indicator: statusArea[role],
        })
        child.connectObject('destroy', () => this._forget(role), this)
      })
    }
    for (const [role, origin] of [...this._origins])
      if (statusArea[role] !== origin.indicator) this._forget(role)
    return [...this._origins]
      .map(([role, { box, rank, child }]) => ({ role, box, rank, child }))
      .sort(
        (a, b) =>
          BOXES.indexOf(a.box) - BOXES.indexOf(b.box) ||
          a.rank - b.rank ||
          a.role.localeCompare(b.role),
      )
  }

  // Puts every icon where `items` says, and `overflow`, the overflow
  // button's container, when there is one. Icons GNOME or other extensions
  // put in a box and that are not tray icons keep their place: tray icons
  // go after them in the left and centre boxes, before them in the right
  // box.
  apply(items, overflow = null) {
    const children = new Map()
    for (const [role, origin] of this._origins) children.set(role, origin.child)
    if (overflow) children.set(OVERFLOW_ROLE, overflow)
    const managed = new Set(children.values())

    for (const box of BOXES) {
      const parent = Main.panel[BOX_ACTORS[box]]
      if (!parent) continue

      const shown = items
        .filter((item) => item.box === box && item.state === 'shown')
        .map((item) => children.get(item.role))
        .filter(Boolean)
      const others = parent
        .get_children()
        .filter((child) => !managed.has(child))
      const desired =
        box === 'right' ? [...shown, ...others] : [...others, ...shown]

      desired.forEach((child, index) => {
        if (!managed.has(child)) return
        if (
          child.get_parent() !== parent ||
          parent.get_child_at_index(index) !== child
        )
          this._move(child, parent, index, overflow)
      })
    }

    for (const item of items) {
      if (item.state === 'shown') continue
      const child = children.get(item.role)
      if (child && child.get_parent() !== this._holder)
        this._mover.move(child, this._holder)
    }
  }

  // The overflow is Cornerstone's own, destroyed on disable: not recorded
  // for restoring.
  _move(child, parent, index, overflow) {
    if (child !== overflow) {
      this._mover.move(child, parent, index)
      return
    }
    if (child.get_parent() === parent) {
      parent.set_child_at_index(child, index)
      return
    }
    child.get_parent()?.remove_child(child)
    parent.insert_child_at_index(child, index)
  }

  _forget(role) {
    this._origins.get(role)?.child.disconnectObject(this)
    this._origins.delete(role)
  }

  destroy() {
    this._mover.restoreAll()
    for (const role of [...this._origins.keys()]) this._forget(role)
    this._holder.destroy()
    this._holder = null
  }
}
