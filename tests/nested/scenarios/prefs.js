import GLib from 'gi://GLib'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'

import {
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

function secondaryPanel() {
  return global.dashToPanel?.panels?.find((p) => p.isStandalone && !p.isPrimary)
}

function mirrored(panel) {
  return panel._rightBox
    .get_children()
    .map((c) => c.get_first_child?.())
    .some((a) => a?._omniMirror && a._role === ROLE)
}

function readCatalog(settings) {
  return JSON.parse(settings.get_string('mirror-indicator-catalog'))
}

export async function run() {
  const nMonitors = global.display.get_n_monitors()
  assert(nMonitors === 2, `prefs needs 2 monitors, shell sees ${nMonitors}`)

  const policy = await import(
    `file://${GLib.getenv('OMNIBAR_EXT_DIR')}/mirror/policy.js`
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

  await disable()
  assert(
    settings.get_string('mirror-indicator-catalog') === '{}',
    'catalog reset on disable',
  )

  done('prefs')
}
