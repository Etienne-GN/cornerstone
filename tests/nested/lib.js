import Gio from 'gi://Gio'
import GLib from 'gi://GLib'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js'

function readMetadata() {
  const dir = GLib.getenv('OMNIBAR_EXT_DIR')
  if (!dir) throw new Error('OMNIBAR_EXT_DIR is not set; use run.sh')

  const [, bytes] = GLib.file_get_contents(`${dir}/metadata.json`)
  return JSON.parse(new TextDecoder().decode(bytes))
}

export const UUID = readMetadata().uuid
export const MONITORS = Number(GLib.getenv('NESTED_MONITORS') ?? 1)
export const VERTICAL = GLib.getenv('NESTED_VERTICAL') === '1'

export function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

export function sleep(ms) {
  return new Promise((resolve) =>
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    }),
  )
}

export async function waitFor(fn, timeoutMs = 5000) {
  const deadline = GLib.get_monotonic_time() + timeoutMs * 1000
  for (;;) {
    const value = fn()
    if (value) return value
    if (GLib.get_monotonic_time() > deadline)
      throw new Error(`waitFor timed out after ${timeoutMs} ms: ${fn}`)
    await sleep(50)
  }
}

export function ext() {
  return Main.extensionManager.lookup(UUID)
}

export async function enable() {
  assert(ext(), `extension ${UUID} is not installed`)
  Main.extensionManager.enableExtension(UUID)
  await waitFor(() => {
    const { state, error } = ext()
    if (state === ExtensionState.ERROR) throw new Error(`enable: ${error}`)
    return state === ExtensionState.ACTIVE
  })
}

export async function disable() {
  Main.extensionManager.disableExtension(UUID)
  await waitFor(() => {
    const { state, error } = ext()
    if (state === ExtensionState.ERROR) throw new Error(`disable: ${error}`)
    return state === ExtensionState.INACTIVE
  })
}

export async function cycle(n) {
  for (let i = 0; i < n; i++) {
    await disable()
    await enable()
  }
}

const HOST_SYSTEM_SERVICES = [
  'org.freedesktop.login1',
  'org.gnome.DisplayManager',
  'org.freedesktop.PolicyKit1',
  'org.freedesktop.NetworkManager',
]

// Last call of every scenario: run.sh fails a run without this sentinel.
export function done(scenario) {
  const [names] = Gio.DBus.system
    .call_sync(
      'org.freedesktop.DBus',
      '/org/freedesktop/DBus',
      'org.freedesktop.DBus',
      'ListNames',
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    )
    .deepUnpack()
  const leaked = names.filter((n) => HOST_SYSTEM_SERVICES.includes(n))
  assert(!leaked.length, `host services on the system bus: ${leaked}`)
  console.log(`[omnibar-test] DONE ${scenario}`)
}
