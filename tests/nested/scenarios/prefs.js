import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'

import {
  sleep,
  captureStage,
  useClassicLayout,
  MONITORS,
  assert,
  disable,
  done,
  enable,
  ext,
  waitFor,
} from '../lib.js'

export const METRICS = {}

const ROLE = 'omniTest'
const PREFS_UI_TIMEOUT_S = 60

function secondaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isStandalone && !p.isPrimary)
}

function mirrored(panel) {
  return panel._rightBox
    .get_children()
    .map((c) => c.get_first_child?.())
    .some((a) => a?._cornerstoneMirror && a._role === ROLE)
}

function readCatalog(settings) {
  return JSON.parse(settings.get_string('mirror-indicator-catalog'))
}

// GTK may only reach the nested compositor: its socket in the private
// runtime dir, never a display inherited from the host.
async function checkPreferencesUi(catalog) {
  const runtime = GLib.getenv('XDG_RUNTIME_DIR') ?? ''
  const display = 'cornerstone-nested'
  assert(runtime.includes('/.nested/'), `runtime dir ${runtime} not private`)
  assert(
    GLib.file_test(`${runtime}/${display}`, GLib.FileTest.EXISTS),
    `no nested Wayland socket in ${runtime}`,
  )

  const launcher = new Gio.SubprocessLauncher({
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE,
  })
  launcher.setenv('WAYLAND_DISPLAY', display, true)
  launcher.setenv('GDK_BACKEND', 'wayland', true)
  launcher.unsetenv('DISPLAY')
  launcher.setenv('CORNERSTONE_CATALOG', catalog, true)
  const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0])
  const script = GLib.build_filenamev([here, '..', 'prefs-ui.js'])
  const proc = launcher.spawnv(['gjs', '-m', script])
  let timedOut = false
  const timeoutId = GLib.timeout_add_seconds(
    GLib.PRIORITY_DEFAULT,
    PREFS_UI_TIMEOUT_S,
    () => {
      timedOut = true
      proc.force_exit()
      return GLib.SOURCE_REMOVE
    },
  )
  // prefs-ui prints SHOW <page> while a page is on screen.
  const stdout = new Gio.DataInputStream({
    base_stream: proc.get_stdout_pipe(),
  })
  const readLine = () =>
    new Promise((resolve, reject) =>
      stdout.read_line_async(GLib.PRIORITY_DEFAULT, null, (s, res) => {
        try {
          const [line] = s.read_line_finish_utf8(res)
          resolve(line)
        } catch (e) {
          reject(e)
        }
      }),
    )
  const lines = []
  try {
    for (let line; (line = await readLine()) !== null; ) {
      lines.push(line)
      const shown = /^SHOW (\S+)$/.exec(line)
      if (shown) await captureStage(`prefs-${shown[1]}`)
    }
    await new Promise((resolve) =>
      proc.wait_async(null, (p, res) => resolve(p.wait_finish(res))),
    )
  } finally {
    if (!timedOut) GLib.source_remove(timeoutId)
  }
  const out = lines.join('\n')
  console.log(`[cornerstone-test] prefs-ui: ${out.trim()}`)
  assert(!timedOut, `prefs-ui killed after ${PREFS_UI_TIMEOUT_S} s`)
  assert(proc.get_successful(), `prefs-ui failed: ${out.trim()}`)
  assert(out.includes('prefs-ui OK'), `prefs-ui did not finish: ${out.trim()}`)
}

export async function run() {
  useClassicLayout()
  const nMonitors = global.display.get_n_monitors()
  assert(nMonitors === 2, `prefs needs 2 monitors, shell sees ${nMonitors}`)

  const policy = await import(
    `file://${GLib.getenv('CORNERSTONE_EXT_DIR')}/mirror/policy.js`
  )

  await enable()
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
  const settings = ext().stateObj.getSettings()

  const button = new PanelMenu.Button(0.5, ROLE)
  button.add_child(
    new St.Icon({
      icon_name: 'face-smile-symbolic',
      style_class: 'system-status-icon',
    }),
  )
  Main.panel.addToStatusArea(ROLE, button, 0, 'right')

  const catalog = await waitFor(() => {
    const c = readCatalog(settings)
    return (
      c.monitors?.length === 2 && c.roles?.some((r) => r.role === ROLE) && c
    )
  })

  const panel = secondaryPanel()
  const dtpPrimary = panel.panelManager.dtpPrimaryMonitor.index
  const primary = catalog.monitors[0]
  assert(primary.key === 'main' && primary.primary, 'primary monitor first')
  assert(
    catalog.monitors[1].primary === false && catalog.monitors[1].key !== 'main',
    'secondary second',
  )
  const dtpMonitor = Main.layoutManager.monitors[dtpPrimary]
  assert(
    primary.width === dtpMonitor.width && primary.height === dtpMonitor.height,
    'first entry matches the dash-to-panel primary monitor',
  )

  const labels = catalog.roles.map((r) => r.label)
  const sorted = [...labels].sort((a, b) => a.localeCompare(b))
  assert(
    JSON.stringify(labels) === JSON.stringify(sorted),
    `roles sorted by label: ${labels}`,
  )
  const excluded = catalog.roles.filter((r) =>
    policy.EXCLUDED_ROLES.includes(r.role),
  )
  assert(
    !excluded.length,
    `excluded roles present: ${JSON.stringify(excluded)}`,
  )

  const key = catalog.monitors[1].key
  assert(
    key === policy.monitorKey(global.display, panel.monitor.index, dtpPrimary),
    'secondary key matches the policy key',
  )
  await waitFor(() => mirrored(panel))
  policy.setIndicatorEnabled(settings, key, ROLE, false)
  await waitFor(() => !mirrored(panel))
  policy.setIndicatorEnabled(settings, key, ROLE, true)
  await waitFor(() => mirrored(panel))

  button.destroy()
  await waitFor(
    () => !readCatalog(settings).roles?.some((r) => r.role === ROLE),
  )

  // Two tray icons for the Tray page to list.
  const samples = ['cornerstoneSampleA', 'cornerstoneSampleB'].map((role, i) => {
    const sample = new PanelMenu.Button(0.5, role)
    sample.add_child(
      new St.Icon({
        icon_name: ['weather-clear-symbolic', 'emblem-music-symbolic'][i],
        style_class: 'system-status-icon',
      }),
    )
    Main.panel.addToStatusArea(role, sample, 0, 'right')
    return sample
  })
  await waitFor(
    () => readCatalog(settings).tray?.length >= 2,
  )
  await checkPreferencesUi(settings.get_string('mirror-indicator-catalog'))

  // The real entry point, through GNOME's Extensions app.
  ext().stateObj.openPreferences()
  const prefsWindow = await waitFor(
    () =>
      global
        .get_window_actors()
        .map((a) => a.meta_window)
        .find((w) => w.get_wm_class() === 'org.gnome.Shell.Extensions'),
    15000,
  )
  await sleep(1500)
  await captureStage('prefs-window')
  assert(
    prefsWindow.get_title()?.includes('Cornerstone'),
    `preferences window title: ${prefsWindow.get_title()}`,
  )
  prefsWindow.delete(global.get_current_time())
  await sleep(500)
  for (const sample of samples) sample.destroy()

  await disable()
  assert(
    settings.get_string('mirror-indicator-catalog') === '{}',
    'catalog reset on disable',
  )

  done('prefs')
}
