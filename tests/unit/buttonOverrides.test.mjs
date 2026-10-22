import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const logged = []
const overrides = loadGjs(
  fileURLToPath(new URL('../../src/button/overrides.js', import.meta.url)),
  { console: { error: (...args) => logged.push(args) } },
)
const {
  parseOverrides,
  overriddenValue,
  withOverride,
  withOverrideValue,
} = overrides

const plain = (value) => JSON.parse(JSON.stringify(value))

test('invalid JSON reads as no override and is reported once', () => {
  logged.length = 0
  assert.deepEqual(plain(parseOverrides('{nope')), {})
  assert.deepEqual(plain(parseOverrides('{nope')), {})
  assert.equal(logged.length, 1)
  assert.deepEqual(plain(parseOverrides('[]')), {})
})

test('unknown keys and wrong types are dropped', () => {
  const parsed = parseOverrides(
    JSON.stringify({
      main: { 'clock-format': '%H:%M', 'clock-font': 3, other: 'x' },
      'connector:DP-1': { 'button-elements': ['clock', 4] },
      'connector:DP-2': 'nope',
    }),
  )
  assert.deepEqual(plain(parsed), {
    main: { 'clock-format': '%H:%M' },
    'connector:DP-1': {},
  })
})

test('a monitor without its own value follows every monitor', () => {
  const saved = { main: { 'clock-format': '' } }
  assert.equal(overriddenValue(saved, 'main', 'clock-format'), '')
  assert.equal(overriddenValue(saved, 'main', 'clock-font'), undefined)
  assert.equal(overriddenValue(saved, 'connector:DP-1', 'clock-format'), undefined)
})

test('turning an override on and off leaves other monitors alone', () => {
  const saved = { main: { 'clock-font': 'Sans 12' } }
  const on = withOverride(saved, 'connector:DP-1', {
    'clock-format': '%H:%M',
  })
  assert.deepEqual(plain(on), {
    main: { 'clock-font': 'Sans 12' },
    'connector:DP-1': { 'clock-format': '%H:%M' },
  })
  assert.deepEqual(plain(withOverride(on, 'connector:DP-1', null)), saved)
  assert.deepEqual(plain(saved), { main: { 'clock-font': 'Sans 12' } })
})

test('setting one value keeps the monitor\'s others', () => {
  const saved = { main: { 'clock-font': 'Sans 12', 'clock-format': '' } }
  assert.deepEqual(
    plain(withOverrideValue(saved, 'main', 'clock-format', '%H')),
    { main: { 'clock-font': 'Sans 12', 'clock-format': '%H' } },
  )
})
