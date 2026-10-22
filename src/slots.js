/*
 * Takes over panel button slots without patching dash-to-panel.
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

// PanelMenu.Button containers are St.Bins that dash-to-panel positions as
// panel elements. Swapping a container's child keeps that position without
// touching dash-to-panel. dash-to-panel reuses the same buttons, and so the
// same containers, across rebuilds, so everything is tracked per container
// and the first child seen is always the original.
export class Slots {
  constructor() {
    this._swaps = new Map()
    this._hidden = new Set()
    // Separate signal owners, so releasing a swap keeps a hide watch.
    this._swapOwner = {}
    this._hideOwner = {}
  }

  // Puts `actor` in `container` in place of its original child.
  swap(container, actor) {
    let record = this._swaps.get(container)
    if (!record) {
      record = { original: container.get_child(), actor: null }
      this._swaps.set(container, record)
      container.connectObject(
        'destroy',
        () => this._swaps.delete(container),
        this._swapOwner,
      )
    }
    if (record.actor === actor && container.get_child() === actor) return

    record.actor = actor
    container.set_child(actor)
  }

  // The actor this instance put in `container`, if it is still there.
  owner(container) {
    const record = this._swaps.get(container)
    return record && container.get_child() === record.actor
      ? record.actor
      : null
  }

  // Puts the original child back.
  release(container) {
    const record = this._swaps.get(container)
    if (!record) return

    this._swaps.delete(container)
    container.disconnectObject(this._swapOwner)
    if (container.get_child() === record.actor)
      container.set_child(record.original)
  }

  // dash-to-panel shows hidden containers again when it rebuilds.
  hide(container) {
    if (!this._hidden.has(container)) {
      this._hidden.add(container)
      container.connectObject(
        'notify::visible',
        () => container.hide(),
        'destroy',
        () => this._hidden.delete(container),
        this._hideOwner,
      )
    }
    container.hide()
  }

  show(container) {
    if (!this._hidden.delete(container)) return

    container.disconnectObject(this._hideOwner)
    container.show()
  }

  releaseAll() {
    for (const container of [...this._hidden])
      this._step(() => this.show(container))
    for (const container of [...this._swaps.keys()])
      this._step(() => this.release(container))
  }

  _step(fn) {
    try {
      fn()
    } catch (e) {
      console.error('[cornerstone] slot restore', e)
    }
  }
}
