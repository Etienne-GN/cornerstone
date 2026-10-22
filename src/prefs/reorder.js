/*
 * Reorderable rows: drag a row onto another, or use its move buttons.
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

import Gdk from 'gi://Gdk'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'

import { _ } from './i18n.js'

// Adds a drag handle and move buttons to `row`. `move(key, delta)` moves it
// by one place; `dropOn(draggedKey, targetKey)` puts the dragged row where
// the target row is.
export function makeReorderable(row, key, { move, dropOn, first, last }) {
  const handle = new Gtk.Image({
    icon_name: 'list-drag-handle-symbolic',
    css_classes: ['dim-label'],
    tooltip_text: _('Drag to reorder'),
  })
  row.add_prefix(handle)

  for (const [icon, delta, tooltip, disabled] of [
    ['go-up-symbolic', -1, _('Move up'), first],
    ['go-down-symbolic', 1, _('Move down'), last],
  ]) {
    const button = new Gtk.Button({
      icon_name: icon,
      valign: Gtk.Align.CENTER,
      tooltip_text: tooltip,
      sensitive: !disabled,
      css_classes: ['flat'],
    })
    button.connect('clicked', () => move(key, delta))
    row.add_suffix(button)
  }

  const drag = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
  drag.connect('prepare', () => Gdk.ContentProvider.new_for_value(key))
  drag.connect('drag-begin', (source) =>
    source.set_icon(new Gtk.WidgetPaintable({ widget: row }), 0, 0),
  )
  handle.add_controller(drag)

  const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)
  drop.connect('drop', (_target, value) => {
    if (value !== key) dropOn(value, key)
    return true
  })
  row.add_controller(drop)
}

// The keys with `dragged` moved to where `target` is.
export function dropOrder(keys, dragged, target) {
  const rest = keys.filter((k) => k !== dragged)
  const at = rest.indexOf(target)
  const from = keys.indexOf(dragged)
  const to = keys.indexOf(target)
  rest.splice(from < to ? at + 1 : at, 0, dragged)
  return rest
}

// The keys with `key` moved by `delta` places.
export function stepOrder(keys, key, delta) {
  const from = keys.indexOf(key)
  const to = Math.max(0, Math.min(keys.length - 1, from + delta))
  const out = [...keys]
  out.splice(from, 1)
  out.splice(to, 0, key)
  return out
}

// Rows added to a group, removed together before a rebuild.
export class RowSet {
  constructor(group) {
    this._group = group
    this._rows = []
  }

  add(row) {
    this._group.add(row)
    this._rows.push(row)
    return row
  }

  clear() {
    for (const row of this._rows) this._group.remove(row)
    this._rows = []
  }
}
