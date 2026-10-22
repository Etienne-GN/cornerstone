/*
 * Puts one Cornerstone button in place of the date menu and system menu on
 * every bar.
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

import { monitorKey } from '../mirror/policy.js'
import { Slots } from '../slots.js'
import { CornerstoneButton } from './button.js'
import { ButtonConfig } from './config.js'

const ENABLED_KEY = 'one-button'
const ACTION_CENTER_KEY = 'action-center'

export class OneButton {
  // `panels` is the PanelSource; `actionCenter` opens for a button.
  constructor(settings, panels, actionCenter) {
    this._settings = settings
    this._panels = panels
    this._actionCenter = actionCenter
    this._slots = new Slots()
    // dateMenu container -> its button; containers outlive panels.
    this._buttons = new Map()
    this._active = false
    this.onActiveChanged = null
  }

  get isActive() {
    return this._active
  }

  // Buttons on every bar, the top bar first.
  get buttons() {
    return [...this._buttons.values()]
  }

  enable() {
    this._settings.connectObject(
      `changed::${ENABLED_KEY}`,
      () => this.sync(),
      `changed::${ACTION_CENTER_KEY}`,
      () => this.sync(),
      this,
    )
    this._panels.connectObject('changed', () => this.sync(), this)
    this.sync()
  }

  destroy() {
    this._settings.disconnectObject(this)
    this._panels.disconnectObject(this)
    this._teardown()
  }

  // The button needs the Action Center: without it, GNOME's menus stay.
  _wanted() {
    return (
      this._settings.get_boolean(ENABLED_KEY) &&
      this._settings.get_boolean(ACTION_CENTER_KEY) &&
      this._actionCenter.isEnabled
    )
  }

  sync() {
    try {
      if (this._wanted()) this._place()
      else this._teardown()
    } catch (e) {
      console.error('[cornerstone] one button', e)
    }
    this._setActive(this._wanted() && this._buttons.size > 0)
  }

  _setActive(active) {
    if (this._active === active) return
    this._active = active
    this.onActiveChanged?.(active)
  }

  _panelFor(statusArea) {
    return this._panels.dtpPanels.find((p) => p.statusArea === statusArea)
  }

  // The key the button's per-monitor settings use: 'main' for the top bar
  // and dash-to-panel's primary panel, like the tray.
  _monitorFor(statusArea) {
    const panel = this._panelFor(statusArea)
    if (statusArea === Main.panel.statusArea || !panel || panel.isPrimary)
      return 'main'
    return monitorKey(global.display, panel.monitor.index, -1)
  }

  _place() {
    for (const statusArea of this._panels.statusAreas) {
      const date = statusArea.dateMenu?.container
      if (!date) continue

      let button = this._buttons.get(date)
      if (!button) {
        button = new CornerstoneButton(
          new ButtonConfig(this._settings, this._monitorFor(statusArea)),
          (b) => this._actionCenter.toggle(b),
        )
        this._buttons.set(date, button)
        button.connectObject(
          'destroy',
          () => {
            if (this._buttons.get(date) === button) this._buttons.delete(date)
          },
          this,
        )
      }
      button.setMonitor(this._monitorFor(statusArea))
      const panel = this._panelFor(statusArea)
      button.setVertical(panel?.checkIfVertical?.() ?? false)
      this._slots.swap(date, button.container)

      const system = statusArea.quickSettings?.container
      if (system) this._slots.hide(system)
    }
  }

  _teardown() {
    this._slots.releaseAll()
    for (const button of this._buttons.values()) {
      button.disconnectObject(this)
      button.destroy()
    }
    this._buttons.clear()
  }
}
