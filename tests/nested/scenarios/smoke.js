import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import { MONITORS, assert, cycle, disable, enable, waitFor } from '../lib.js'

export const METRICS = {}

export async function run() {
  const nMonitors = global.display.get_n_monitors()
  assert(
    nMonitors === MONITORS,
    `expected ${MONITORS} monitors, shell sees ${nMonitors}`,
  )

  await enable()
  await waitFor(() => global.dashToPanel?.panels?.length === nMonitors)

  await cycle(5)
  await waitFor(() => global.dashToPanel?.panels?.length === nMonitors)

  await disable()
  assert(
    Main.panel.get_parent() === Main.layoutManager.panelBox,
    'Main.panel is back in panelBox after disable',
  )
  assert(
    global.dashToPanel === undefined,
    'global.dashToPanel is removed after disable',
  )
}
