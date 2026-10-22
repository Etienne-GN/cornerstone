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
  logLines,
  waitFor,
} from '../lib.js'

// Run with --monitors 2. A mirror cleanup and the Action Center teardown
// throw during disable; GNOME disables extensions on every screen lock, so
// the rest of disable must still run and leave the stock panel behind.

export const METRICS = {}

const ROLE = 'cornerstoneFault'
const INJECTED = 'cornerstone-test injected fault'

function stageActors(actor = global.stage, found = []) {
  found.push(actor)
  for (const child of actor.get_children()) stageActors(child, found)
  return found
}

const stageMirrors = () => stageActors().filter((a) => a._cornerstoneMirror)

function addFake() {
  const button = new PanelMenu.Button(0.5, ROLE)
  button.add_child(
    new St.Icon({
      icon_name: 'face-smile-symbolic',
      style_class: 'system-status-icon',
    }),
  )
  Main.panel.addToStatusArea(ROLE, button, 0, 'right')
  return button
}

async function enableAndMirror() {
  await enable()
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
  await waitFor(() => stageMirrors().some((a) => a._role === ROLE))
  await waitFor(() => stageMirrors().some((a) => a._role === 'quickSettings'))
}

export async function run() {
  assert(MONITORS === 2, `disable-fault needs --monitors 2, got ${MONITORS}`)
  const fake = addFake()

  await enableAndMirror()
  const bars = global.dashToPanel.panels.flatMap((p) =>
    p.isStandalone ? [p.clipContainer, p.panelBox, p] : [p.clipContainer, p],
  )

  const faulty = stageMirrors().find((a) => a._role === ROLE)
  const cleanup = faulty._cleanup.bind(faulty)
  faulty._cleanup = () => {
    cleanup()
    throw new Error(INJECTED)
  }
  const actionCenter = ext().stateObj.actionCenter
  const destroyActionCenter = actionCenter.destroy.bind(actionCenter)
  actionCenter.destroy = () => {
    destroyActionCenter()
    throw new Error(INJECTED)
  }

  // run.sh ignores [cornerstone] error lines that carry the INJECTED marker.
  await disable()

  for (const context of ['mirror cleanup', 'disable action center'])
    assert(
      logLines(new RegExp(`\\[cornerstone\\] ${context}.*${INJECTED}`)).length,
      `${context} error logged`,
    )
  assert(
    Main.panel.get_parent() === Main.layoutManager.panelBox,
    'Main.panel is back in panelBox',
  )
  assert(global.dashToPanel === undefined, 'global.dashToPanel removed')
  assert(stageMirrors().length === 0, 'no _cornerstoneMirror actor after disable')
  const onStage = new Set(stageActors())
  assert(
    bars.every((bar) => !onStage.has(bar)),
    'no Cornerstone bar left on stage',
  )

  await enableAndMirror()
  await disable()
  assert(stageMirrors().length === 0, 'clean disable after the faulty one')

  fake.destroy()
  done('disable-fault')
}
