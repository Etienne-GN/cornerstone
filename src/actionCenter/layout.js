/*
 * The Action Center layout: rows top to bottom, each a run of columns left
 * to right, each a stack of blocks. Shared by the shell and the preferences.
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

export const LAYOUT_KEY = 'action-center-layout'

// Every block, in the order a block shown again is looked for.
export const BLOCKS = [
  'quick-settings',
  'notifications',
  'today',
  'calendar',
  'events',
  'world-clocks',
  'weather',
]

// A column takes its width from these blocks when it holds any, so a long
// event title wraps instead of widening the calendar (dateMenu.js does the
// same for its calendar column).
export const WIDTH_BLOCKS = [
  'quick-settings',
  'notifications',
  'today',
  'calendar',
]

// The first value of each is the default.
export const BLOCK_ALIGNS = ['fill', 'start', 'center', 'end']
export const COLUMN_WIDTHS = ['fill', 'fit']
export const COLUMN_VALIGNS = ['start', 'center', 'end', 'fill']
export const ROW_ALIGNS = ['center', 'start', 'end']

const block = (id) => ({ id, align: 'fill' })

export function newColumn(blocks = []) {
  return { width: 'fill', valign: 'start', blocks }
}

export function newRow(columns = []) {
  return { align: 'center', columns }
}

export const DEFAULT_LAYOUT = {
  rows: [
    newRow([newColumn([block('quick-settings')])]),
    newRow([
      { ...newColumn([block('notifications')]), valign: 'fill' },
      {
        ...newColumn(
          ['today', 'calendar', 'events', 'world-clocks', 'weather'].map(block),
        ),
        width: 'fit',
      },
    ]),
  ],
}

const pick = (value, allowed) => (allowed.includes(value) ? value : allowed[0])
const list = (value) => (Array.isArray(value) ? value : [])

// A layout from anything: unknown blocks, repeats and bad values dropped,
// empty columns and rows removed. A blank or broken string is the default.
export function parseLayout(text) {
  let raw
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  return normalize(raw ?? DEFAULT_LAYOUT)
}

export function normalize(raw) {
  const seen = new Set()
  const rows = []
  for (const row of list(raw?.rows)) {
    const columns = []
    for (const column of list(row?.columns)) {
      const blocks = []
      for (const b of list(column?.blocks)) {
        const id = typeof b === 'string' ? b : b?.id
        if (!BLOCKS.includes(id) || seen.has(id)) continue
        seen.add(id)
        blocks.push({ id, align: pick(b?.align, BLOCK_ALIGNS) })
      }
      if (!blocks.length) continue
      columns.push({
        width: pick(column.width, COLUMN_WIDTHS),
        valign: pick(column.valign, COLUMN_VALIGNS),
        blocks,
      })
    }
    if (columns.length)
      rows.push({ align: pick(row.align, ROW_ALIGNS), columns })
  }
  return { rows }
}

export function serializeLayout(layout) {
  return JSON.stringify(normalize(layout))
}

// Where block `id` is, or null when it is hidden.
export function findBlock(layout, id) {
  for (const [row, r] of layout.rows.entries())
    for (const [column, c] of r.columns.entries()) {
      const index = c.blocks.findIndex((b) => b.id === id)
      if (index >= 0) return { row, column, index }
    }
  return null
}

export function hiddenBlocks(layout) {
  return BLOCKS.filter((id) => !findBlock(layout, id))
}

const clone = (layout) => JSON.parse(JSON.stringify(layout))

// The layout with block `id` moved to `target`, whose indices are read
// against `layout` as it is, the block still in place:
//   { kind: 'block', row, column, index }  into a column, before `index`
//   { kind: 'column', row, index }         a new column, before `index`
//   { kind: 'row', index }                 a new row, before `index`
//   { kind: 'hidden' }
export function moveBlock(layout, id, target) {
  const out = clone(layout)
  const from = findBlock(out, id)
  let moved = block(id)
  if (from) {
    const blocks = out.rows[from.row].columns[from.column].blocks
    moved = blocks[from.index]
    // A placeholder keeps the target's indices valid until the insert.
    blocks[from.index] = null
  }

  switch (target.kind) {
    case 'block':
      out.rows[target.row]?.columns[target.column]?.blocks.splice(
        target.index,
        0,
        moved,
      )
      break
    case 'column':
      out.rows[target.row]?.columns.splice(target.index, 0, newColumn([moved]))
      break
    case 'row':
      out.rows.splice(target.index, 0, newRow([newColumn([moved])]))
      break
  }

  for (const row of out.rows)
    for (const column of row.columns)
      column.blocks = column.blocks.filter(Boolean)
  return normalize(out)
}

// Block `id` on a row of its own at the bottom, or the layout as it is when
// it is shown already.
export function showBlock(layout, id) {
  if (findBlock(layout, id)) return layout
  return moveBlock(layout, id, { kind: 'row', index: layout.rows.length })
}

// The layout with `fields` set on block `id`, or on its column or row.
export function setBlockOptions(layout, id, fields) {
  return editAt(layout, id, (_row, _column, b) => Object.assign(b, fields))
}

export function setColumnOptions(layout, id, fields) {
  return editAt(layout, id, (_row, column) => Object.assign(column, fields))
}

export function setRowOptions(layout, id, fields) {
  return editAt(layout, id, (row) => Object.assign(row, fields))
}

function editAt(layout, id, edit) {
  const out = clone(layout)
  const at = findBlock(out, id)
  if (!at) return layout
  const row = out.rows[at.row]
  const column = row.columns[at.column]
  edit(row, column, column.blocks[at.index])
  return normalize(out)
}

// The layout with block `id` moved one step, or the layout as it is when it
// cannot go that way. Up and down move within the column, then out to a
// row of its own; left and right move to the next column, then out to a
// column of its own.
export function stepBlock(layout, id, direction) {
  const at = findBlock(layout, id)
  if (!at) return layout
  const row = layout.rows[at.row]
  const column = row.columns[at.column]
  const alone = row.columns.length === 1 && column.blocks.length === 1
  const last = (items) => items.length - 1

  let target = null
  switch (direction) {
    case 'up':
      if (at.index > 0) target = { kind: 'block', ...at, index: at.index - 1 }
      else if (!alone) target = { kind: 'row', index: at.row }
      else if (at.row > 0) target = { kind: 'row', index: at.row - 1 }
      break
    case 'down':
      if (at.index < last(column.blocks))
        target = { kind: 'block', ...at, index: at.index + 2 }
      else if (!alone) target = { kind: 'row', index: at.row + 1 }
      else if (at.row < last(layout.rows))
        target = { kind: 'row', index: at.row + 2 }
      break
    case 'left':
      if (at.column > 0) {
        const index = row.columns[at.column - 1].blocks.length
        target = { kind: 'block', ...at, column: at.column - 1, index }
      } else if (column.blocks.length > 1) {
        target = { kind: 'column', row: at.row, index: 0 }
      }
      break
    case 'right':
      if (at.column < last(row.columns)) {
        const index = row.columns[at.column + 1].blocks.length
        target = { kind: 'block', ...at, column: at.column + 1, index }
      } else if (column.blocks.length > 1) {
        target = { kind: 'column', row: at.row, index: row.columns.length }
      }
      break
  }
  return target ? moveBlock(layout, id, target) : layout
}
