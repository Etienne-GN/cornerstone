/*
 * The one button's system indicators: live clones of GNOME's quick
 * settings indicators, in the order and with the visibility the user set.
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

import Clutter from 'gi://Clutter'
import GObject from 'gi://GObject'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import { orderIndicators } from './order.js'

const HIDDEN_KEY = 'button-hidden-indicators'
const ORDER_KEY = 'button-indicator-order'

// GNOME names its indicators by QuickSettings field (_network, _volumeOutput
// ...); extension indicators get their class name.
export function indicatorNames(quickSettings) {
  const box = quickSettings._indicators
  const names = new Map()
  for (const key of Object.keys(quickSettings)) {
    const value = quickSettings[key]
    if (key.startsWith('_') && value?.get_parent?.() === box)
      names.set(value, key.slice(1))
  }
  const seen = new Map()
  return box.get_children().map((child) => {
    if (names.has(child)) return { child, name: names.get(child) }
    const base = `extension:${child.constructor.name}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { child, name: n > 1 ? `${base}#${n}` : base }
  })
}

export const IndicatorStrip = GObject.registerClass(
  { GTypeName: 'CornerstoneIndicatorStrip' },
  class IndicatorStrip extends St.BoxLayout {
    _init(settings) {
      super._init({
        style_class: 'panel-status-indicators-box cornerstone-indicators',
        y_align: Clutter.ActorAlign.CENTER,
      })
      this._settings = settings
      this._bindings = []
      this._quickSettings = Main.panel.statusArea.quickSettings
      this._box = this._quickSettings?._indicators ?? null

      settings.connectObject(
        `changed::${HIDDEN_KEY}`,
        () => this._rebuild(),
        `changed::${ORDER_KEY}`,
        () => this._rebuild(),
        this,
      )
      // Extensions add their indicators to the box at any time.
      this._box?.connectObject(
        'child-added',
        () => this._rebuild(),
        'child-removed',
        () => this._rebuild(),
        'destroy',
        () => {
          this._box = null
          this._rebuild()
        },
        this,
      )
      this.connect('destroy', () => {
        settings.disconnectObject(this)
        this._box?.disconnectObject(this)
        this._unbind()
      })
      this._rebuild()
    }

    setVertical(vertical) {
      this.orientation = vertical
        ? Clutter.Orientation.VERTICAL
        : Clutter.Orientation.HORIZONTAL
    }

    // A binding outlives a destroyed clone until it is finalized.
    _unbind() {
      for (const binding of this._bindings) binding.unbind()
      this._bindings = []
    }

    _rebuild() {
      this._unbind()
      this.destroy_all_children()
      if (!this._box) return

      const hidden = new Set(this._settings.get_strv(HIDDEN_KEY))
      const order = this._settings.get_strv(ORDER_KEY)
      const entries = orderIndicators(indicatorNames(this._quickSettings), order)
      for (const { child, name } of entries) {
        if (hidden.has(name)) continue
        const clone = new Clutter.Clone({
          source: child,
          y_align: Clutter.ActorAlign.CENTER,
        })
        clone._cornerstoneIndicator = name
        // Indicators show and hide themselves; so do their clones, so the
        // box spacing only counts what is shown.
        this._bindings.push(
          child.bind_property(
            'visible',
            clone,
            'visible',
            GObject.BindingFlags.SYNC_CREATE,
          ),
        )
        this.add_child(clone)
      }
    }
  },
)
