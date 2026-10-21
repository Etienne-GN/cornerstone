import { test } from 'node:test'
import assert from 'node:assert/strict'

import { releaseUrl } from '../../src/releaseLinks.js'

test('no url yields no link', () => {
  assert.equal(releaseUrl({ url: '', version: 3 }), null)
  assert.equal(releaseUrl({ version: 3 }), null)
})

test('tag link without commit, commit link with one', () => {
  assert.equal(
    releaseUrl({ url: 'https://x.test/r', version: 3 }),
    'https://x.test/r/releases/tag/v3',
  )
  assert.equal(
    releaseUrl({ url: 'https://x.test/r', version: 3, commit: 'abc' }),
    'https://x.test/r/commit/abc',
  )
})
