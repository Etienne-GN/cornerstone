/*
 * Finds the bars Cornerstone works on: dash-to-panel's panels when it runs,
 * GNOME's top bar otherwise.
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

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { EventEmitter } from 'resource:///org/gnome/shell/misc/signals.js'

export const DTP_UUID = 'dash-to-panel@jderose9.github.com'

// Emits `changed` when dash-to-panel creates its panels (on enable and on
// every rebuild) and when it is enabled or disabled. dash-to-panel replaces
// global.dashToPanel on each enable, so the connection follows it.
export class PanelSource extends EventEmitter {
  constructor() {
    super()
    this._emitter = null
  }

  enable() {
    Main.extensionManager.connectObject(
      'extension-state-changed',
      (_manager, extension) => {
        if (extension.uuid !== DTP_UUID) return
        this._follow()
        this.emit('changed')
      },
      this,
    )
    this._follow()
  }

  disable() {
    Main.extensionManager.disconnectObject(this)
    this._emitter?.disconnectObject(this)
    this._emitter = null
  }

  // dash-to-panel's panels, or an empty list when it is not running.
  get dtpPanels() {
    const panels = global.dashToPanel?.panels
    return Array.isArray(panels) ? panels : []
  }

  get hasDashToPanel() {
    return this.dtpPanels.length > 0
  }

  // Every status area holding a date menu or system menu: the top bar's,
  // and the secondary dash-to-panel panels' own.
  get statusAreas() {
    const areas = new Set([Main.panel.statusArea])
    for (const panel of this.dtpPanels)
      if (panel.statusArea) areas.add(panel.statusArea)
    return [...areas]
  }

  _follow() {
    const emitter = global.dashToPanel ?? null
    if (emitter === this._emitter) return

    this._emitter?.disconnectObject(this)
    this._emitter = emitter
    emitter?.connectObject('panels-created', () => this.emit('changed'), this)
  }
}
