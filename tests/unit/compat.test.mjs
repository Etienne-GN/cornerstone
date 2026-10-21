import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const path = fileURLToPath(new URL('../../src/compat.js', import.meta.url))
const PopupAnimation = { NONE: 0, FULL: 3 }
const Orientation = { HORIZONTAL: 'h', VERTICAL: 'v' }

const load = (version) =>
  loadGjs(path, {
    parseInt,
    Config: { PACKAGE_VERSION: version },
    BoxPointer: { PopupAnimation },
    Clutter: { Orientation },
  })

const plain = (value) => JSON.parse(JSON.stringify(value))

const recorder = () => {
  const calls = []
  return {
    calls,
    open: (...args) => calls.push(['open', ...args]),
    close: (...args) => calls.push(['close', ...args]),
  }
}

test('50 passes PopupAnimation', () => {
  const compat = load('50.5')
  assert.equal(compat.IS_51, false)
  const menu = recorder()
  compat.menuOpen(menu)
  compat.menuOpen(menu, { animate: false })
  compat.menuClose(menu)
  compat.menuClose(menu, { animate: false })
  assert.deepEqual(plain(menu.calls), [
    ['open', PopupAnimation.FULL],
    ['open', PopupAnimation.NONE],
    ['close', PopupAnimation.FULL],
    ['close', PopupAnimation.NONE],
  ])
})

test('51 passes a params object', () => {
  const compat = load('51.1')
  assert.equal(compat.IS_51, true)
  const menu = recorder()
  compat.menuOpen(menu)
  compat.menuOpen(menu, { animate: false })
  compat.menuClose(menu)
  compat.menuClose(menu, { animate: false })
  assert.deepEqual(plain(menu.calls), [
    ['open', { animate: true }],
    ['open', { animate: false }],
    ['close', { animate: true }],
    ['close', { animate: false }],
  ])
})

test('setBoxVertical uses orientation when present, else vertical', () => {
  const { setBoxVertical } = load('50.5')
  const modern = { orientation: 'h' }
  setBoxVertical(modern, true)
  assert.equal(modern.orientation, 'v')
  setBoxVertical(modern, false)
  assert.equal(modern.orientation, 'h')
  const legacy = { vertical: false }
  setBoxVertical(legacy, true)
  assert.equal(legacy.vertical, true)
})

test('verticalBoxProps uses orientation', () => {
  const { verticalBoxProps } = load('51.1')
  assert.deepEqual(plain(verticalBoxProps()), { orientation: 'v' })
})

test('animateFromArg reads a 50 PopupAnimation', () => {
  const { animateFromArg } = load('50.5')
  assert.deepEqual(plain(animateFromArg(PopupAnimation.NONE)), {
    animate: false,
  })
  assert.deepEqual(plain(animateFromArg(PopupAnimation.FULL)), {
    animate: true,
  })
  assert.deepEqual(plain(animateFromArg(undefined)), { animate: true })
})

test('animateFromArg reads a 51 params object', () => {
  const { animateFromArg } = load('51.1')
  assert.deepEqual(plain(animateFromArg({ animate: false })), {
    animate: false,
  })
  assert.deepEqual(plain(animateFromArg({ animate: true })), {
    animate: true,
  })
  assert.deepEqual(plain(animateFromArg({})), { animate: true })
  assert.deepEqual(plain(animateFromArg(undefined)), { animate: true })
})
