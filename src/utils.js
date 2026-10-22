/*
 * Small lifetime helpers shared by Cornerstone's modules.
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

import GLib from 'gi://GLib'

// Signal connections released together: add([object, signal(s), callback]).
export class GlobalSignalsHandler {
  constructor() {
    this._handlers = []
  }

  add(...entries) {
    for (const [object, signals, callback] of entries) {
      for (const signal of [].concat(signals))
        this._handlers.push([object, object.connect(signal, callback)])
    }
  }

  destroy() {
    for (const [object, id] of this._handlers) object.disconnect(id)
    this._handlers = []
  }
}

// One pending GLib timeout per label; adding a label again replaces it.
export class TimeoutsHandler {
  constructor() {
    this._ids = new Map()
  }

  addWithLabel(label, [, delay, callback]) {
    this.removeWithLabel(label)
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
      this._ids.delete(label)
      callback()
      return GLib.SOURCE_REMOVE
    })
    this._ids.set(label, id)
  }

  removeWithLabel(label) {
    const id = this._ids.get(label)
    if (!id) return

    GLib.Source.remove(id)
    this._ids.delete(label)
  }

  destroy() {
    for (const label of [...this._ids.keys()]) this.removeWithLabel(label)
  }
}
