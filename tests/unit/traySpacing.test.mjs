import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const spacing = loadGjs(
  fileURLToPath(new URL('../../src/tray/spacing.js', import.meta.url)),
  { console: { error: () => {} } },
)

const OWN = '-natural-hpadding: 4px; -minimum-hpadding: 4px;'

function actor(style = null) {
  return {
    style,
    get_style() {
      return this.style
    },
    set_style(style) {
      this.style = style
    },
    queue_relayout() {},
    connectObject() {},
    disconnectObject() {},
  }
}

test('style: own padding after the original, or the original alone', () => {
  assert.equal(spacing.spacingStyle(null, 4), OWN)
  assert.equal(spacing.spacingStyle('', 4), OWN)
  assert.equal(spacing.spacingStyle('color: red', 4), `color: red; ${OWN}`)
  assert.equal(spacing.spacingStyle('color: red; ', 4), `color: red; ${OWN}`)
  assert.equal(spacing.spacingStyle('color: red', -1), 'color: red')
  assert.equal(spacing.spacingStyle(null, -1), null)
})

test('apply keeps the first original; restore and -1 give it back', () => {
  const s = new spacing.TraySpacing()
  const a = actor('color: red;')
  s.apply(a, 4)
  s.apply(a, 2)
  assert.equal(a.style, 'color: red; -natural-hpadding: 2px; -minimum-hpadding: 2px;')
  s.apply(a, -1)
  assert.equal(a.style, 'color: red;')

  const b = actor()
  s.apply(b, 0)
  s.restoreAll()
  assert.equal(b.style, null)
})
