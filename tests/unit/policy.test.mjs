import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const policy = loadGjs(
  fileURLToPath(new URL('../../src/mirror/policy.js', import.meta.url)),
)

class Settings {
  constructor(value = '{}') {
    this.values = { 'mirror-indicator-visibility': value }
  }
  get_string(key) {
    return this.values[key]
  }
  set_string(key, value) {
    this.values[key] = value
  }
}

test('key names', () => {
  assert.equal(policy.CATALOG_KEY, 'mirror-indicator-catalog')
  assert.equal(policy.VISIBILITY_KEY, 'mirror-indicator-visibility')
})

test('invalid or non-object JSON reads as empty', () => {
  for (const value of ['not json', '[]', 'null', '3', '"x"'])
    assert.equal(
      JSON.stringify(policy.readVisibility(new Settings(value))),
      '{}',
      value,
    )
})

test('indicators are enabled by default', () => {
  const settings = new Settings()
  assert.equal(policy.indicatorIsEnabled(settings, 'main', 'clipboard'), true)
  assert.equal(
    policy.indicatorIsEnabled(settings, 'main', 'clipboard', false),
    false,
  )
})

test('per-monitor overrides are independent', () => {
  const settings = new Settings()
  policy.setIndicatorEnabled(settings, 'connector:DP-1', 'clipboard', false)
  policy.setIndicatorEnabled(settings, 'connector:DP-1', 'other', true)
  assert.equal(
    policy.indicatorIsEnabled(settings, 'connector:DP-1', 'clipboard'),
    false,
  )
  assert.equal(
    policy.indicatorIsEnabled(settings, 'connector:DP-1', 'other'),
    true,
  )
  assert.equal(policy.indicatorIsEnabled(settings, 'main', 'clipboard'), true)
  assert.equal(
    policy.indicatorIsEnabled(settings, 'connector:DP-2', 'clipboard'),
    true,
  )
})

test('set recovers from corrupt stored value', () => {
  const settings = new Settings('[1]')
  policy.setIndicatorEnabled(settings, 'main', 'a', false)
  assert.deepEqual(JSON.parse(settings.values['mirror-indicator-visibility']), {
    main: { a: false },
  })
})

test('monitor keys', () => {
  const display = { get_monitor_plug_name: (i) => ['HDMI-1', null][i] }
  assert.equal(policy.monitorKey(display, 1, 1), 'main')
  assert.equal(policy.monitorKey(display, 0, 1), 'connector:HDMI-1')
  assert.equal(policy.monitorKey(display, 2, 1), 'monitor:2')
  assert.equal(policy.monitorKey({}, 0, 1), 'monitor:0')
})

test('excluded roles cover per-panel owned items', () => {
  for (const role of ['quickSettings', 'dateMenu', 'activities', 'a11y'])
    assert.ok(policy.EXCLUDED_ROLES.includes(role), role)
})

test('source visibility prefers the primary override', () => {
  const actor = { visible: false }
  assert.equal(policy.sourceIsVisible(actor), false)
  policy.primaryVisibility.set(actor, { visible: true })
  assert.equal(policy.sourceIsVisible(actor), true)
  assert.equal(policy.sourceIsVisible(null), false)
})

test('invalid JSON is logged once per distinct value', () => {
  const errors = []
  const logged = loadGjs(
    fileURLToPath(new URL('../../src/mirror/policy.js', import.meta.url)),
    { console: { error: (...args) => errors.push(args) } },
  )
  for (const value of ['bad', 'bad', 'worse', 'bad', '{}'])
    logged.readVisibility(new Settings(value))
  assert.equal(errors.length, 2)
  assert.equal(
    errors[0][0],
    '[cornerstone] mirror policy: invalid JSON in mirror-indicator-visibility',
  )
  assert.equal(errors[0][1]?.name, 'SyntaxError', 'the error itself is logged')
})
