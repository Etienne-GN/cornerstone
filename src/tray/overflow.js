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

export const DEFAULT_COLUMNS = 4

// Row by row, `columns` to a row, every cell a square as big as the
// biggest icon.
// Panel buttons have no height of their own outside a bar, which
// Clutter.FlowLayout collapses; their CSS min-height gives them one here.
export const OverflowGridLayout = GObject.registerClass(
  { GTypeName: 'CornerstoneOverflowGridLayout' },
  class OverflowGridLayout extends Clutter.LayoutManager {
    _init(columns = DEFAULT_COLUMNS) {
      super._init()
      this._columns = Math.max(1, columns)
      this._spacing = 0
    }

    get columns() {
      return this._columns
    }

    set columns(columns) {
      columns = Math.max(1, columns)
      if (this._columns === columns) return
      this._columns = columns
      this.layout_changed()
    }

    set spacing(spacing) {
      if (this._spacing === spacing) return
      this._spacing = spacing
      this.layout_changed()
    }

    _visible(container) {
      return container.get_children().filter((child) => child.visible)
    }

    // [columns, rows, cell width, cell height]
    _grid(container) {
      const children = this._visible(container)
      if (!children.length) return [0, 0, 0, 0]
      let width = 0
      let height = 0
      for (const child of children) {
        width = Math.max(width, child.get_preferred_width(-1)[1])
        height = Math.max(height, child.get_preferred_height(-1)[1])
      }
      const columns = Math.min(this._columns, children.length)
      const rows = Math.ceil(children.length / columns)
      // Square cells: as easy to hit up and down as sideways.
      const side = Math.max(width, height)
      return [columns, rows, side, side]
    }

    _span(count, cell) {
      return count ? count * cell + (count - 1) * this._spacing : 0
    }

    vfunc_get_preferred_width(container, _forHeight) {
      const [columns, , width] = this._grid(container)
      const size = this._span(columns, width)
      return [size, size]
    }

    vfunc_get_preferred_height(container, _forWidth) {
      const [, rows, , height] = this._grid(container)
      const size = this._span(rows, height)
      return [size, size]
    }

    vfunc_allocate(container, box) {
      const [columns, , width, height] = this._grid(container)
      const rtl =
        container.get_text_direction() === Clutter.TextDirection.RTL
      this._visible(container).forEach((child, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = (rtl ? columns - 1 - column : column) * (width + this._spacing)
        const y = row * (height + this._spacing)
        const cell = new Clutter.ActorBox()
        cell.set_origin(box.x1 + x, box.y1 + y)
        cell.set_size(width, height)
        child.allocate(cell)
      })
    }
  },
)

export const OverflowButton = GObject.registerClass(
  { GTypeName: 'CornerstoneOverflowButton' },
  class OverflowButton extends PanelMenu.Button {
    _init(side = St.Side.TOP, columns = DEFAULT_COLUMNS) {
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

      this._grid = new OverflowGridLayout(columns)
      this._flow = new St.Widget({
        style_class: 'cornerstone-overflow',
        layout_manager: this._grid,
      })
      this._flow.connectObject(
        'style-changed',
        () => {
          this._grid.spacing = this._flow
            .get_theme_node()
            .get_length('spacing')
        },
        this,
      )
      this.menu.box.add_child(this._flow)
      this._indicators = []
      this._flow.connectObject(
        'child-added',
        () => this._sync(),
        'child-removed',
        () => this._sync(),
        this,
      )
      this._sync()
    }

    setColumns(columns) {
      this._grid.columns = columns
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

    // Clones of system indicators, after the icons, shown while their
    // source is; a click opens the Action Center through `activate`.
    setIndicators(sources, activate) {
      if (
        sources.length === this._indicators.length &&
        sources.every((source, i) => this._indicators[i].source === source)
      )
        return

      this._clearIndicators()
      this._indicators = sources.map((source) => {
        const cell = new St.Button({
          style_class: 'cornerstone-overflow-indicator',
          can_focus: true,
          child: new Clutter.Clone({
            source,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
          }),
        })
        cell.connect('clicked', () => {
          menuClose(this.menu, { animate: false })
          activate(this)
        })
        cell.connect('notify::visible', () => this._sync())
        const binding = source.bind_property(
          'visible',
          cell,
          'visible',
          GObject.BindingFlags.SYNC_CREATE,
        )
        // A binding outlives a destroyed clone until it is finalized.
        cell.connect('destroy', () => binding.unbind())
        this._flow.add_child(cell)
        return { source, cell }
      })
      this._sync()
    }

    _clearIndicators() {
      for (const { cell } of this._indicators) cell.destroy()
      this._indicators = []
    }

    _sync() {
      const empty = !this._flow.get_children().some((child) => child.visible)
      this.container.visible = !empty
      if (empty && this.menu.isOpen) menuClose(this.menu, { animate: false })
    }
  },
)
