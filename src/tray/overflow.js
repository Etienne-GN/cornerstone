/*
 * The overflow button: a chevron on a bar holding the tray icons the user
 * put in the overflow, in a small popup.
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

import { menuClose } from '../compat.js'

// Points at where the popup opens: away from the bar's edge.
const CHEVRONS = {
  [St.Side.TOP]: 'pan-down-symbolic',
  [St.Side.BOTTOM]: 'pan-up-symbolic',
  [St.Side.LEFT]: 'pan-end-symbolic',
  [St.Side.RIGHT]: 'pan-start-symbolic',
}

export const OverflowButton = GObject.registerClass(
  { GTypeName: 'CornerstoneOverflowButton' },
  class OverflowButton extends PanelMenu.Button {
    _init(side = St.Side.TOP) {
      super._init(0.5, 'Cornerstone overflow')
      this.add_style_class_name('cornerstone-overflow-button')
      this._cornerstoneOverflow = true
      this.add_child(
        new St.Icon({
          icon_name: CHEVRONS[side] ?? 'pan-down-symbolic',
          style_class: 'system-status-icon',
        }),
      )
      this.menu._arrowSide = side
      this.menu.actor.add_style_class_name('cornerstone-overflow-popup')
      this.menu.box.add_style_class_name('cornerstone-overflow-menu')

      // A row: panel buttons have no height of their own outside a bar,
      // which a FlowLayout collapses to nothing.
      this._flow = new St.BoxLayout({ style_class: 'cornerstone-overflow' })
      this.menu.box.add_child(this._flow)
      this._flow.connectObject(
        'child-added',
        () => this._sync(),
        'child-removed',
        () => this._sync(),
        this,
      )
      this._sync()
    }

    // Holds the overflowed mirrors' containers.
    get flow() {
      return this._flow
    }

    // A click on an icon closes the popup first; the icon's own menu then
    // opens against this button.
    adopt(mirror) {
      mirror.connectObject(
        'event',
        (_actor, event) => {
          const type = event.type()
          if (
            type === Clutter.EventType.BUTTON_PRESS ||
            type === Clutter.EventType.TOUCH_BEGIN
          )
            menuClose(this.menu, { animate: false })
          return Clutter.EVENT_PROPAGATE
        },
        this,
      )
    }

    _sync() {
      const empty = this._flow.get_n_children() === 0
      this.container.visible = !empty
      if (empty && this.menu.isOpen) menuClose(this.menu, { animate: false })
    }
  },
)
