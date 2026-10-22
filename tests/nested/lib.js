import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import Shell from 'gi://Shell'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js'

function readMetadata() {
  const dir = GLib.getenv('CORNERSTONE_EXT_DIR')
  if (!dir) throw new Error('CORNERSTONE_EXT_DIR is not set; use run.sh')

  const [, bytes] = GLib.file_get_contents(`${dir}/metadata.json`)
  return JSON.parse(new TextDecoder().decode(bytes))
}

export const UUID = readMetadata().uuid

// Cornerstone's settings, usable before the extension is enabled.
export function cornerstoneSettings() {
  const dir = GLib.getenv('CORNERSTONE_EXT_DIR')
  const source = Gio.SettingsSchemaSource.new_from_directory(
    `${dir}/schemas`,
    Gio.SettingsSchemaSource.get_default(),
    false,
  )
  const schema = source.lookup(readMetadata()['settings-schema'], false)
  return new Gio.Settings({ settings_schema: schema })
}

// Scenarios written for GNOME's clock and system menu next to each other
// turn the one button off before enabling.
export function useClassicLayout() {
  cornerstoneSettings().set_boolean('one-button', false)
}
export const MONITORS = Number(GLib.getenv('NESTED_MONITORS') ?? 1)
export const VERTICAL = GLib.getenv('NESTED_VERTICAL') === '1'
export const DTP = GLib.getenv('NESTED_DTP') === '1'

// dash-to-panel's panels once it built one per monitor; [] without it.
export async function bars() {
  if (!DTP) return []
  return waitFor(() => {
    const panels = global.dashToPanel?.panels
    return panels?.length === MONITORS && panels
  })
}

export const DTP_UUID = 'dash-to-panel@jderose9.github.com'

export function dtpSettings() {
  return Main.extensionManager
    .lookup(DTP_UUID)
    .stateObj.getSettings('org.gnome.shell.extensions.dash-to-panel')
}

// Every status area with a date menu and system menu: the top bar's and
// the secondary dash-to-panel panels' own.
export function statusAreas() {
  const areas = new Set([Main.panel.statusArea])
  for (const panel of global.dashToPanel?.panels ?? [])
    if (panel.statusArea) areas.add(panel.statusArea)
  return [...areas]
}

// After Cornerstone is disabled, every slot holds its own button again.
export function assertSlotsRestored(what) {
  for (const [i, area] of statusAreas().entries()) {
    for (const role of ['dateMenu', 'quickSettings']) {
      const button = area[role]
      if (!button) continue
      assert(
        button.container.get_child() === button,
        `${what}: ${role} #${i} does not hold its own button`,
      )
      assert(button.container.visible, `${what}: ${role} #${i} is hidden`)
    }
  }
}

// Lines of this run's shell log matching `pattern`, for warnings that do not
// fail a run by themselves.
export function logLines(pattern) {
  const [, bytes] = GLib.file_get_contents(GLib.getenv('NESTED_LOG'))
  return new TextDecoder()
    .decode(bytes)
    .split('\n')
    .filter((line) => pattern.test(line))
}

// Writes the whole nested stage to .nested/<scenario>/<name>.png and
// returns the path.
export function captureStage(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name))
    throw new Error(`invalid capture name: ${name}`)

  const path = `${GLib.path_get_dirname(GLib.getenv('NESTED_LOG'))}/${name}.png`
  const stream = Gio.File.new_for_path(path).replace(
    null,
    false,
    Gio.FileCreateFlags.NONE,
    null,
  )
  const shooter = new Shell.Screenshot()
  return new Promise((resolve, reject) => {
    shooter.screenshot(false, stream, (obj, res) => {
      try {
        obj.screenshot_finish(res)
        stream.close(null)
        console.log(`[cornerstone-test] captured ${path}`)
        resolve(path)
      } catch (e) {
        reject(e)
      }
    })
  })
}

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

export function assertIsolated() {
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
}

// Last call of every scenario: run.sh fails a run without this sentinel.
export function done(scenario) {
  assertIsolated()
  console.log(`[cornerstone-test] DONE ${scenario}`)
}
