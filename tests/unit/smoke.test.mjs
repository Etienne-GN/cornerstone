import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const metadataPath = fileURLToPath(new URL('../../metadata.json', import.meta.url))

test('metadata.json parses and declares a uuid', () => {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  assert.ok(metadata.uuid, 'uuid missing')
})
