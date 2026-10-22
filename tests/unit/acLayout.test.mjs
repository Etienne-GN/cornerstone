import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const {
  BLOCKS,
  DEFAULT_LAYOUT,
  findBlock,
  hiddenBlocks,
  moveBlock,
  parseLayout,
  serializeLayout,
  setBlockOptions,
  setColumnOptions,
  setRowOptions,
  showBlock,
} = loadGjs(
  fileURLToPath(new URL('../../src/actionCenter/layout.js', import.meta.url)),
)

const plain = (value) => JSON.parse(JSON.stringify(value))
// Rows of columns of block ids.
const ids = (layout) =>
  plain(layout.rows.map((r) => r.columns.map((c) => c.blocks.map((b) => b.id))))

const DEFAULT_IDS = [
  [['quick-settings']],
  [
    ['notifications'],
    ['today', 'calendar', 'events', 'world-clocks', 'weather'],
  ],
]

test('the default: quick settings on top, notifications beside the calendar', () => {
  assert.deepEqual(ids(parseLayout('')), DEFAULT_IDS)
  assert.deepEqual(ids(parseLayout('not json')), DEFAULT_IDS)
  assert.deepEqual(ids(DEFAULT_LAYOUT), DEFAULT_IDS)
  assert.deepEqual(plain(hiddenBlocks(parseLayout(''))), [])
})

test('the default holds every block once', () => {
  assert.deepEqual(ids(DEFAULT_LAYOUT).flat(2).sort(), [...BLOCKS].sort())
})

test('parsing drops unknown blocks, repeats, bad values and empties', () => {
  const layout = parseLayout(
    JSON.stringify({
      rows: [
        { align: 'sideways', columns: [{ blocks: ['bogus'] }] },
        {
          align: 'end',
          columns: [
            {
              width: 'huge',
              valign: 'end',
              blocks: ['weather', { id: 'today', align: 'center' }, 'weather'],
            },
            { blocks: [] },
          ],
        },
      ],
    }),
  )
  assert.deepEqual(plain(layout), {
    rows: [
      {
        align: 'end',
        columns: [
          {
            width: 'fill',
            valign: 'end',
            blocks: [
              { id: 'weather', align: 'fill' },
              { id: 'today', align: 'center' },
            ],
          },
        ],
      },
    ],
  })
  assert.deepEqual(plain(hiddenBlocks(layout)), [
    'quick-settings',
    'notifications',
    'calendar',
    'events',
    'world-clocks',
  ])
})

test('serializing round-trips', () => {
  const layout = parseLayout('')
  assert.deepEqual(plain(parseLayout(serializeLayout(layout))), plain(layout))
})

test('moving a block within its column', () => {
  const layout = parseLayout('')
  // Weather before today: index 0 of its own column.
  const moved = moveBlock(layout, 'weather', {
    kind: 'block',
    row: 1,
    column: 1,
    index: 0,
  })
  assert.deepEqual(ids(moved)[1][1], [
    'weather',
    'today',
    'calendar',
    'events',
    'world-clocks',
  ])
  // Today after events: before world clocks, read with today in place.
  const later = moveBlock(layout, 'today', {
    kind: 'block',
    row: 1,
    column: 1,
    index: 3,
  })
  assert.deepEqual(ids(later)[1][1], [
    'calendar',
    'events',
    'today',
    'world-clocks',
    'weather',
  ])
})

test('moving the last block out of a row removes the row', () => {
  const layout = parseLayout('')
  const moved = moveBlock(layout, 'quick-settings', {
    kind: 'column',
    row: 1,
    index: 2,
  })
  assert.deepEqual(ids(moved), [
    [
      ['notifications'],
      ['today', 'calendar', 'events', 'world-clocks', 'weather'],
      ['quick-settings'],
    ],
  ])
  assert.equal(moved.rows[0].columns[2].width, 'fill')
})

test('a new row keeps the moved block options', () => {
  let layout = setBlockOptions(parseLayout(''), 'weather', { align: 'end' })
  layout = moveBlock(layout, 'weather', { kind: 'row', index: 0 })
  assert.deepEqual(ids(layout)[0], [['weather']])
  assert.equal(layout.rows[0].columns[0].blocks[0].align, 'end')
})

test('hiding and showing a block', () => {
  let layout = moveBlock(parseLayout(''), 'events', { kind: 'hidden' })
  assert.equal(findBlock(layout, 'events'), null)
  assert.deepEqual(plain(hiddenBlocks(layout)), ['events'])

  layout = showBlock(layout, 'events')
  assert.deepEqual(plain(findBlock(layout, 'events')), {
    row: 2,
    column: 0,
    index: 0,
  })
  assert.equal(showBlock(layout, 'events'), layout)
})

test('a hidden block dropped into a column', () => {
  let layout = moveBlock(parseLayout(''), 'events', { kind: 'hidden' })
  layout = moveBlock(layout, 'events', {
    kind: 'block',
    row: 0,
    column: 0,
    index: 1,
  })
  assert.deepEqual(ids(layout)[0], [['quick-settings', 'events']])
})

test('options land on the block, its column or its row', () => {
  let layout = parseLayout('')
  layout = setBlockOptions(layout, 'calendar', { align: 'center' })
  layout = setColumnOptions(layout, 'calendar', {
    width: 'fill',
    valign: 'end',
  })
  layout = setRowOptions(layout, 'calendar', { align: 'start' })
  const row = layout.rows[1]
  assert.equal(row.align, 'start')
  assert.equal(row.columns[1].width, 'fill')
  assert.equal(row.columns[1].valign, 'end')
  assert.equal(row.columns[1].blocks[1].align, 'center')
  // Bad values fall back to the default.
  layout = setBlockOptions(layout, 'calendar', { align: 'diagonal' })
  assert.equal(layout.rows[1].columns[1].blocks[1].align, 'fill')
  // A hidden block has nothing to set.
  const hidden = moveBlock(layout, 'weather', { kind: 'hidden' })
  assert.equal(setBlockOptions(hidden, 'weather', { align: 'end' }), hidden)
})

test('stepping a block up and down', () => {
  const { stepBlock } = loadGjs(
    fileURLToPath(new URL('../../src/actionCenter/layout.js', import.meta.url)),
  )
  const layout = parseLayout('')
  // Within the column.
  assert.deepEqual(ids(stepBlock(layout, 'calendar', 'up'))[1][1].slice(0, 2), [
    'calendar',
    'today',
  ])
  assert.deepEqual(ids(stepBlock(layout, 'today', 'down'))[1][1].slice(0, 2), [
    'calendar',
    'today',
  ])
  // Out of the column, to a row of its own above or below.
  assert.deepEqual(ids(stepBlock(layout, 'today', 'up'))[1], [['today']])
  assert.deepEqual(ids(stepBlock(layout, 'weather', 'down'))[2], [['weather']])
  // Alone in its row: past the next row.
  assert.deepEqual(ids(stepBlock(layout, 'quick-settings', 'down'))[1], [
    ['quick-settings'],
  ])
  assert.equal(stepBlock(layout, 'quick-settings', 'up'), layout)
})

test('stepping a block left and right', () => {
  const { stepBlock } = loadGjs(
    fileURLToPath(new URL('../../src/actionCenter/layout.js', import.meta.url)),
  )
  const layout = parseLayout('')
  // Into the next column, at its end.
  assert.deepEqual(ids(stepBlock(layout, 'notifications', 'right'))[1], [
    ['today', 'calendar', 'events', 'world-clocks', 'weather', 'notifications'],
  ])
  assert.deepEqual(ids(stepBlock(layout, 'weather', 'left'))[1][0], [
    'notifications',
    'weather',
  ])
  // Out to a column of its own at the edge.
  assert.deepEqual(ids(stepBlock(layout, 'weather', 'right'))[1][2], [
    'weather',
  ])
  // Alone in its column at the edge: nowhere to go.
  assert.equal(stepBlock(layout, 'notifications', 'left'), layout)
  assert.equal(stepBlock(layout, 'quick-settings', 'right'), layout)
  // Hidden blocks do not step.
  const hidden = moveBlock(layout, 'events', { kind: 'hidden' })
  assert.equal(stepBlock(hidden, 'events', 'up'), hidden)
})
