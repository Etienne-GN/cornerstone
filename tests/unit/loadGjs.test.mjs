import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const scratch = fileURLToPath(new URL('../../.nested/unit/', import.meta.url))

test('modules are evaluated in strict mode like GJS', () => {
  mkdirSync(scratch, { recursive: true })
  const path = `${scratch}strict.js`
  writeFileSync(
    path,
    'export const strict = (function () { return !this })()\n',
  )
  assert.equal(loadGjs(path).strict, true)
})
