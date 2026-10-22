/*
 * The Action Center layout editor: a mock of the popup whose blocks are
 * dragged between columns and rows, and the options of the block selected.
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

import Adw from 'gi://Adw'
import Gdk from 'gi://Gdk'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'
import Pango from 'gi://Pango'

import {
  findBlock,
  hiddenBlocks,
  LAYOUT_KEY,
  moveBlock,
  parseLayout,
  serializeLayout,
  setBlockOptions,
  setColumnOptions,
  setRowOptions,
  showBlock,
  stepBlock,
} from '../actionCenter/layout.js'
import { _ } from './i18n.js'
import {
  BLOCK_ALIGNS,
  BLOCK_LABELS,
  COLUMN_VALIGNS,
  COLUMN_WIDTHS,
  ROW_ALIGNS,
} from './labels.js'

const CSS = `
.cornerstone-mock {
  padding: 10px;
  border-radius: 18px;
  background-color: alpha(currentColor, 0.05);
  border: 1px solid alpha(currentColor, 0.12);
}
.cornerstone-mock-column {
  padding: 4px;
  border-radius: 10px;
  background-color: alpha(currentColor, 0.04);
}
.cornerstone-mock-column:drop(active) {
  background-color: alpha(var(--accent-bg-color), 0.18);
}
.cornerstone-mock-tile {
  padding: 4px 8px;
  border-radius: 8px;
  background-color: alpha(currentColor, 0.1);
}
.cornerstone-mock-tile:hover {
  background-color: alpha(currentColor, 0.15);
}
.cornerstone-mock-tile.selected {
  box-shadow: inset 0 0 0 2px var(--accent-bg-color);
}
.cornerstone-mock-tile.drop-before {
  box-shadow: 0 -3px 0 0 var(--accent-bg-color);
}
.cornerstone-mock-tile.drop-after {
  box-shadow: 0 3px 0 0 var(--accent-bg-color);
}
.cornerstone-mock-gap {
  border-radius: 4px;
}
.cornerstone-mock-gap.row {
  min-height: 6px;
}
.cornerstone-mock-gap.column {
  min-width: 6px;
}
.cornerstone-mock.dragging .cornerstone-mock-gap.row,
.cornerstone-mock-gap.row.empty {
  min-height: 22px;
  background-color: alpha(currentColor, 0.06);
}
.cornerstone-mock.dragging .cornerstone-mock-gap.column {
  min-width: 22px;
  background-color: alpha(currentColor, 0.06);
}
.cornerstone-mock-gap:drop(active) {
  background-color: var(--accent-bg-color);
}
.cornerstone-mock-tray {
  min-height: 40px;
  padding: 6px;
  border-radius: 12px;
  border: 1px dashed alpha(currentColor, 0.3);
}
.cornerstone-mock-tray:drop(active) {
  background-color: alpha(var(--accent-bg-color), 0.18);
}
`

// Each block's size in the mock, roughly its share of the real popup.
const TILE_SIZES = {
  'quick-settings': [180, 64],
  notifications: [180, 120],
  today: [130, 26],
  calendar: [130, 92],
  events: [130, 30],
  'world-clocks': [130, 30],
  weather: [130, 30],
}

const ALIGN = {
  fill: Gtk.Align.FILL,
  start: Gtk.Align.START,
  center: Gtk.Align.CENTER,
  end: Gtk.Align.END,
}

let cssLoaded = false
function loadCss() {
  if (cssLoaded) return
  cssLoaded = true
  const provider = new Gtk.CssProvider()
  provider.load_from_string(CSS)
  Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
  )
}

function clearBox(box) {
  let child
  while ((child = box.get_first_child())) box.remove(child)
}

// A combo row over `choices` ([value, label] pairs) that calls
// `onChange(value)` when the user picks one.
function choiceRow(title, choices, onChange) {
  const row = new Adw.ComboRow({
    title,
    model: Gtk.StringList.new(choices.map(([, label]) => label())),
  })
  row._choices = choices
  row.connect('notify::selected', () => {
    if (row._syncing) return
    const value = choices[row.selected]?.[0]
    if (value) onChange(value)
  })
  return row
}

function setChoice(row, value) {
  row._syncing = true
  try {
    row.selected = Math.max(
      0,
      row._choices.findIndex(([v]) => v === value),
    )
  } finally {
    row._syncing = false
  }
}

export class LayoutEditor {
  constructor(settings) {
    this._settings = settings
    this._selected = null
    this._layout = parseLayout(settings.get_string(LAYOUT_KEY))
    this._pending = 0
    loadCss()

    this._buildMock()
    this._buildOptions()

    this._settingId = settings.connect(`changed::${LAYOUT_KEY}`, () =>
      this._sync(),
    )
    this._sync()
  }

  destroy() {
    if (this._settingId) this._settings.disconnect(this._settingId)
    this._settingId = 0
    if (this._pending) GLib.source_remove(this._pending)
    this._pending = 0
  }

  get layout() {
    return this._layout
  }

  get selected() {
    return this._selected
  }

  _write(layout) {
    this._settings.set_string(LAYOUT_KEY, serializeLayout(layout))
  }

  // A drop rebuilds the mock: wait for the drag to finish with its tile.
  _writeLater(layout) {
    if (this._pending) GLib.source_remove(this._pending)
    this._pending = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._pending = 0
      this._write(layout)
      return GLib.SOURCE_REMOVE
    })
  }

  select(id) {
    this._selected = id
    this._syncSelection()
    this._syncOptions()
  }

  _sync() {
    this._layout = parseLayout(this._settings.get_string(LAYOUT_KEY))
    this._buildRows()
    this._buildTray()
    this._syncSelection()
    this._syncOptions()
  }

  // The popup mock and the hidden tray, in one group.
  _buildMock() {
    this.mockGroup = new Adw.PreferencesGroup({
      title: _('Layout'),
      description: _(
        'Drag the blocks to arrange the Action Center: onto a column to stack them, beside a column for a new column, between rows for a new row. Click a block for its options.',
      ),
    })
    const reset = new Gtk.Button({
      label: _('Reset'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    })
    reset.connect('clicked', () => this._settings.reset(LAYOUT_KEY))
    this.mockGroup.header_suffix = reset

    this.mock = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      css_classes: ['cornerstone-mock'],
    })
    this.mockGroup.add(this.mock)

    const trayTitle = new Gtk.Label({
      label: _('Hidden blocks'),
      xalign: 0,
      css_classes: ['heading'],
      margin_top: 18,
      margin_bottom: 6,
    })
    this.mockGroup.add(trayTitle)

    this.tray = new Gtk.FlowBox({
      selection_mode: Gtk.SelectionMode.NONE,
      column_spacing: 6,
      row_spacing: 6,
      max_children_per_line: 7,
      hexpand: true,
    })
    this._trayEmpty = new Gtk.Label({
      label: _('Drag a block here to hide it.'),
      css_classes: ['dim-label'],
      hexpand: true,
    })
    const trayBox = new Gtk.Box({ css_classes: ['cornerstone-mock-tray'] })
    trayBox.append(this.tray)
    trayBox.append(this._trayEmpty)
    this._addDrop(trayBox, () => ({ kind: 'hidden' }))
    this.mockGroup.add(trayBox)
  }

  _buildRows() {
    clearBox(this.mock)
    this._tiles = {}
    const { rows } = this._layout

    rows.forEach((row, r) => {
      this.mock.append(this._rowGap(r))

      const fills = row.columns.some((c) => c.width === 'fill')
      const rowBox = new Gtk.Box({
        halign: fills ? Gtk.Align.FILL : ALIGN[row.align],
        hexpand: true,
      })
      row.columns.forEach((column, c) => {
        rowBox.append(this._columnGap(r, c))
        rowBox.append(this._column(column, r, c))
      })
      rowBox.append(this._columnGap(r, row.columns.length))
      this.mock.append(rowBox)
    })

    const last = this._rowGap(rows.length)
    if (!rows.length) {
      last.add_css_class('empty')
      last.append(
        new Gtk.Label({
          label: _('Drag blocks here'),
          css_classes: ['dim-label'],
          hexpand: true,
        }),
      )
    }
    this.mock.append(last)
  }

  _rowGap(index) {
    const gap = new Gtk.Box({
      css_classes: ['cornerstone-mock-gap', 'row'],
      hexpand: true,
    })
    this._addDrop(gap, () => ({ kind: 'row', index }))
    return gap
  }

  _columnGap(row, index) {
    const gap = new Gtk.Box({ css_classes: ['cornerstone-mock-gap', 'column'] })
    this._addDrop(gap, () => ({ kind: 'column', row, index }))
    return gap
  }

  _column({ width, valign, blocks }, r, c) {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 4,
      css_classes: ['cornerstone-mock-column'],
      hexpand: width === 'fill',
      valign: ALIGN[valign],
    })
    const tiles = blocks.map(({ id, align }) => {
      const tile = this._tile(id)
      tile.halign = ALIGN[align]
      box.append(tile)
      return tile
    })

    // The insertion point is before the first tile whose middle is below
    // the pointer.
    const indexAt = (y) => {
      const i = tiles.findIndex((tile) => {
        const [, bounds] = tile.compute_bounds(box)
        return y < bounds.get_y() + bounds.get_height() / 2
      })
      return i < 0 ? tiles.length : i
    }
    const mark = (index) => {
      tiles.forEach((tile, i) => {
        tile.remove_css_class('drop-before')
        tile.remove_css_class('drop-after')
        if (index === null) return
        if (i === index) tile.add_css_class('drop-before')
        else if (i === tiles.length - 1 && index === tiles.length)
          tile.add_css_class('drop-after')
      })
    }
    this._addDrop(
      box,
      (_x, y) => ({ kind: 'block', row: r, column: c, index: indexAt(y) }),
      {
        motion: (_x, y) => mark(indexAt(y)),
        leave: () => mark(null),
      },
    )
    return box
  }

  _tile(id, { hidden = false } = {}) {
    const [label, icon, when] = BLOCK_LABELS[id]
    const [width, height] = TILE_SIZES[id]
    const tile = new Gtk.Box({
      spacing: 6,
      css_classes: ['cornerstone-mock-tile'],
      width_request: hidden ? -1 : width,
      height_request: hidden ? -1 : height,
      tooltip_text: when?.() ?? null,
      cursor: Gdk.Cursor.new_from_name('grab', null),
    })
    tile.append(new Gtk.Image({ icon_name: icon, valign: Gtk.Align.START }))
    tile.append(
      new Gtk.Label({
        label: label(),
        ellipsize: Pango.EllipsizeMode.END,
        xalign: 0,
        valign: Gtk.Align.START,
      }),
    )
    tile._blockId = id

    const click = new Gtk.GestureClick()
    click.connect('released', () => this.select(id))
    tile.add_controller(click)

    const drag = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    drag.connect('prepare', () => Gdk.ContentProvider.new_for_value(id))
    drag.connect('drag-begin', (source) => {
      source.set_icon(new Gtk.WidgetPaintable({ widget: tile }), 0, 0)
      this.mock.add_css_class('dragging')
      this.select(id)
    })
    drag.connect('drag-end', () => this.mock.remove_css_class('dragging'))
    tile.add_controller(drag)

    this._tiles[id] = tile
    return tile
  }

  // `target(x, y)` gives the moveBlock() target of a drop at x, y.
  _addDrop(widget, target, { motion, leave } = {}) {
    const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)
    drop.connect('drop', (_drop, id, x, y) => {
      leave?.()
      this._writeLater(moveBlock(this._layout, id, target(x, y)))
      return true
    })
    if (motion)
      drop.connect('motion', (_drop, x, y) => {
        motion(x, y)
        return Gdk.DragAction.MOVE
      })
    if (leave) drop.connect('leave', () => leave())
    widget.add_controller(drop)
  }

  _buildTray() {
    this.tray.remove_all()
    const hidden = hiddenBlocks(this._layout)
    for (const id of hidden) this.tray.append(this._tile(id, { hidden: true }))
    this.tray.visible = hidden.length > 0
    this._trayEmpty.visible = hidden.length === 0
  }

  _syncSelection() {
    for (const [id, tile] of Object.entries(this._tiles ?? {})) {
      if (id === this._selected) tile.add_css_class('selected')
      else tile.remove_css_class('selected')
    }
  }

  // The options of the selected block, its column and its row.
  _buildOptions() {
    this.optionsGroup = new Adw.PreferencesGroup()

    const edit = (setter, field) => (value) => {
      if (this._selected)
        this._write(setter(this._layout, this._selected, { [field]: value }))
    }
    this.alignRow = choiceRow(
      _('Place in its column'),
      BLOCK_ALIGNS,
      edit(setBlockOptions, 'align'),
    )
    this.widthRow = choiceRow(
      _('Column width'),
      COLUMN_WIDTHS,
      edit(setColumnOptions, 'width'),
    )
    this.valignRow = choiceRow(
      _('Column height'),
      COLUMN_VALIGNS,
      edit(setColumnOptions, 'valign'),
    )
    this.rowAlignRow = choiceRow(
      _('Place of the row'),
      ROW_ALIGNS,
      edit(setRowOptions, 'align'),
    )
    for (const row of [
      this.alignRow,
      this.widthRow,
      this.valignRow,
      this.rowAlignRow,
    ])
      this.optionsGroup.add(row)

    this.moveRow = new Adw.ActionRow({ title: _('Move') })
    this._moveButtons = {}
    for (const [direction, icon, tooltip] of [
      ['left', 'go-previous-symbolic', _('Move left')],
      ['up', 'go-up-symbolic', _('Move up')],
      ['down', 'go-down-symbolic', _('Move down')],
      ['right', 'go-next-symbolic', _('Move right')],
    ]) {
      const button = new Gtk.Button({
        icon_name: icon,
        tooltip_text: tooltip,
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
      })
      button.connect('clicked', () =>
        this._write(stepBlock(this._layout, this._selected, direction)),
      )
      this.moveRow.add_suffix(button)
      this._moveButtons[direction] = button
    }
    this.optionsGroup.add(this.moveRow)

    this.visibilityRow = new Adw.ActionRow()
    this._visibilityButton = new Gtk.Button({ valign: Gtk.Align.CENTER })
    this._visibilityButton.connect('clicked', () => {
      const id = this._selected
      this._write(
        findBlock(this._layout, id)
          ? moveBlock(this._layout, id, { kind: 'hidden' })
          : showBlock(this._layout, id),
      )
    })
    this.visibilityRow.add_suffix(this._visibilityButton)
    this.optionsGroup.add(this.visibilityRow)
  }

  _syncOptions() {
    const id = this._selected
    const at = id && findBlock(this._layout, id)
    const shown = !!at

    this.optionsGroup.title = id ? BLOCK_LABELS[id][0]() : _('Block options')
    this.optionsGroup.description = id
      ? (BLOCK_LABELS[id][2]?.() ?? '')
      : _('Click a block in the layout to set where it sits.')
    for (const row of [
      this.alignRow,
      this.widthRow,
      this.valignRow,
      this.rowAlignRow,
      this.moveRow,
    ])
      row.visible = shown
    this.visibilityRow.visible = !!id

    if (id) {
      this.visibilityRow.title = shown ? _('Shown') : _('Hidden')
      this._visibilityButton.label = shown ? _('Hide') : _('Show')
    }
    if (!shown) return

    const row = this._layout.rows[at.row]
    const column = row.columns[at.column]
    setChoice(this.alignRow, column.blocks[at.index].align)
    setChoice(this.widthRow, column.width)
    setChoice(this.valignRow, column.valign)
    setChoice(this.rowAlignRow, row.align)

    // A column sharing the free width leaves the row nothing to place.
    const fills = row.columns.some((c) => c.width === 'fill')
    this.rowAlignRow.sensitive = !fills
    this.rowAlignRow.subtitle = fills
      ? _('The row is full width: a column in it shares the free width.')
      : ''

    for (const [direction, button] of Object.entries(this._moveButtons))
      button.sensitive = stepBlock(this._layout, id, direction) !== this._layout
  }
}
