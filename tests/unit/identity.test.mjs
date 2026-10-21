import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const scratch = join(repo, '.nested')
const worktrees = []

const read = (root, path) => readFileSync(join(root, path), 'utf8')
const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' })

function assertIdentity(root, slug, name) {
  const metadata = JSON.parse(read(root, 'metadata.json'))
  const schemaId = `org.gnome.shell.extensions.${slug}`

  assert.equal(metadata.uuid, `${slug}@etienne-gn.github.io`)
  assert.equal(metadata['settings-schema'], schemaId)
  assert.equal(metadata['gettext-domain'], slug)
  assert.equal(metadata.name, name)

  const schemaPath = join('schemas', `${schemaId}.gschema.xml`)
  assert.ok(existsSync(join(root, schemaPath)), `${schemaPath} missing`)
  const xml = read(root, schemaPath)
  assert.match(xml, new RegExp(`<schema [^>]*id=["']${schemaId}["']`))
  assert.match(
    xml,
    new RegExp(
      `<schema [^>]*path=["']/org/gnome/shell/extensions/${slug}/["']`,
    ),
  )

  execFileSync('glib-compile-schemas', ['--dry-run', join(root, 'schemas')])
}

function grepLiterals(root, pattern) {
  try {
    return git(
      root,
      'grep',
      '--no-index',
      '--exclude-standard',
      '-nIE',
      pattern,
      '--',
      'src',
      'Makefile',
      'metadata.json',
      'schemas',
      'ui',
    )
  } catch (e) {
    if (e.status === 1) return ''
    throw e
  }
}

after(() => {
  for (const wt of worktrees) {
    try {
      git(repo, 'worktree', 'remove', '--force', wt)
    } catch (e) {
      console.error('[identity.test] teardown worktree remove:', e.message)
    }
    rmSync(wt, { recursive: true, force: true })
  }
  try {
    git(repo, 'worktree', 'prune')
  } catch (e) {
    console.error('[identity.test] teardown worktree prune:', e.message)
  }
})

test('metadata declares the Omnibar identity', () => {
  const metadata = JSON.parse(read(repo, 'metadata.json'))
  assert.deepEqual(metadata['shell-version'], ['50', '51'])
  assertIdentity(repo, 'omnibar', 'Omnibar')
})

test('no upstream identity literals remain in code', () => {
  const found = grepLiterals(
    repo,
    'dash-to-panel@jderose9|org\\.gnome\\.shell\\.extensions\\.dash-to-panel',
  )
  assert.equal(found, '')
})

test('rename.sh rewrites the identity on a worktree copy', () => {
  mkdirSync(scratch, { recursive: true })
  const wt = mkdtempSync(join(scratch, 'rename-'))
  worktrees.push(wt)
  git(repo, 'worktree', 'add', '--detach', '--force', wt, 'HEAD')

  const files = git(repo, 'ls-files', '-co', '--exclude-standard', '-z')
    .split('\0')
    .filter((f) => f && existsSync(join(repo, f)))
  for (const f of files) {
    mkdirSync(dirname(join(wt, f)), { recursive: true })
    cpSync(join(repo, f), join(wt, f))
  }

  execFileSync('bash', [join(wt, 'tools/rename.sh'), 'foo', 'Foo Bar'], {
    cwd: wt,
  })

  assertIdentity(wt, 'foo', 'Foo Bar')
  assert.equal(
    grepLiterals(
      wt,
      'omnibar@etienne|org\\.gnome\\.shell\\.extensions\\.omnibar|extensions/omnibar/',
    ),
    '',
  )
  assert.equal(
    JSON.parse(read(wt, 'metadata.json'))['shell-version'].join(),
    '50,51',
  )
  assert.equal(grepLiterals(wt, "GTypeName: 'Omnibar|\\[omnibar\\]"), '')
  const mirror = read(wt, 'src/mirror/mirroredIndicatorButton.js')
  assert.match(mirror, /GTypeName: 'FooBarMirroredIndicatorButton'/)
  assert.match(read(wt, 'src/mirror/policy.js'), /`\[foo\] mirror policy:/)
})
