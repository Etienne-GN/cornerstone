/*
 * The one bar button: system indicators and the clock, opening the Action
 * Center on its monitor.
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

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'

import { ClockLabel } from './clock.js'
import { IndicatorStrip } from './indicators.js'
import { elementOrder } from './order.js'

const ELEMENTS_KEY = 'button-elements'

export const CornerstoneButton = GObject.registerClass(
  { GTypeName: 'CornerstoneButton' },
  class CornerstoneButton extends PanelMenu.Button {
    // `config` is the ButtonConfig of the button's monitor, destroyed with
    // it; `activate(button)` opens or closes the Action Center for it.
    _init(config, activate) {
      // No menu: PanelMenu's default click handling would toggle it.
      super._init(0.5, 'Cornerstone', true)
      this.add_style_class_name('cornerstone-button')
      this._cornerstoneButton = true
      this._config = config
      this._activate = activate
      this._vertical = false

      this._box = new St.BoxLayout({
        style_class: 'cornerstone-button-box',
        y_align: Clutter.ActorAlign.CENTER,
      })
      this.add_child(this._box)
      this._elements = {
        indicators: new IndicatorStrip(config),
        clock: new ClockLabel(config),
      }

      config.connectObject(
        `changed::${ELEMENTS_KEY}`,
        () => this._syncElements(),
        this,
      )
      this.connect('destroy', () => {
        config.disconnectObject(this)
        // Elements left out of the box are not destroyed with it.
        for (const element of Object.values(this._elements))
          if (!element.get_parent()) element.destroy()
        config.destroy()
      })
      this._syncElements()
    }

    // The monitor whose settings the button follows.
    setMonitor(monitor) {
      this._config.setMonitor(monitor)
    }

    setVertical(vertical) {
      if (this._vertical === vertical) return
      this._vertical = vertical
      this._box.orientation = vertical
        ? Clutter.Orientation.VERTICAL
        : Clutter.Orientation.HORIZONTAL
      this._elements.indicators.setVertical(vertical)
      this._elements.clock.setVertical(vertical)
    }

    _syncElements() {
      for (const element of Object.values(this._elements))
        if (element.get_parent() === this._box) this._box.remove_child(element)
      for (const name of elementOrder(this._config.get_strv(ELEMENTS_KEY)))
        this._box.add_child(this._elements[name])
    }

    vfunc_event(event) {
      const type = event.type()
      if (
        type === Clutter.EventType.BUTTON_PRESS ||
        type === Clutter.EventType.TOUCH_BEGIN
      ) {
        this._activate(this)
        return Clutter.EVENT_STOP
      }
      return Clutter.EVENT_PROPAGATE
    }

    vfunc_key_press_event(event) {
      const key = event.get_key_symbol()
      if (
        key === Clutter.KEY_space ||
        key === Clutter.KEY_Return ||
        key === Clutter.KEY_KP_Enter
      ) {
        this._activate(this)
        return Clutter.EVENT_STOP
      }
      return super.vfunc_key_press_event(event)
    }
  },
)
