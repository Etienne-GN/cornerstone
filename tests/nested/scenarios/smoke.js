import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import {
  DTP,
  MONITORS,
  assert,
  assertSlotsRestored,
  bars,
  cycle,
  disable,
  done,
  enable,
} from '../lib.js'

export const METRICS = {}

export async function run() {
  const nMonitors = global.display.get_n_monitors()
  assert(
    nMonitors === MONITORS,
    `expected ${MONITORS} monitors, shell sees ${nMonitors}`,
  )

  await bars()
  await enable()
  await cycle(5)
  await bars()

  await disable()
  assertSlotsRestored('after disable')
  if (DTP)
    assert(global.dashToPanel?.panels?.length === nMonitors,
      'dash-to-panel keeps its panels after Cornerstone is disabled')
  else
    assert(Main.panel.get_parent() === Main.layoutManager.panelBox,
      'the top bar is untouched')

  done('smoke')
}
