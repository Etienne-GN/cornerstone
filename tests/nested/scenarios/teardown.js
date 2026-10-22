import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js'

import {
  MONITORS,
  assert,
  cycle,
  done,
  enable,
  logLines,
  waitFor,
} from '../lib.js'

// Run with --monitors 2 --with-extension arcmenu@arcmenu.com
// --with-extension appindicatorsupport@rgcjonas.gmail.com. The scenario ends
// with everything enabled, so the shell's own shutdown (uiGroup destroyed
// under live mirrors) is part of the checked log.

export const METRICS = {}

const ARCMENU = 'arcmenu@arcmenu.com'
const APPINDICATOR = 'appindicatorsupport@rgcjonas.gmail.com'
const TEARDOWN_NOISE = /already disposed|has no handler with id|JS ERROR/

function stageMirrors(role, actor = global.stage, found = []) {
  if (actor._cornerstoneMirror && actor._role === role) found.push(actor)
  for (const child of actor.get_children()) stageMirrors(role, child, found)
  return found
}

async function setActive(uuid, active) {
  if (active) Main.extensionManager.enableExtension(uuid)
  else Main.extensionManager.disableExtension(uuid)
  const want = active ? ExtensionState.ACTIVE : ExtensionState.INACTIVE
  await waitFor(() => {
    const { state, error } = Main.extensionManager.lookup(uuid)
    if (state === ExtensionState.ERROR) throw new Error(`${uuid}: ${error}`)
    return state === want
  })
}

function requireActive(uuid) {
  const extension = Main.extensionManager.lookup(uuid)
  assert(extension, `${uuid} missing: run with --with-extension ${uuid}`)
  return waitFor(() => extension.state === ExtensionState.ACTIVE)
}

async function mirrored() {
  await waitFor(() => global.dashToPanel?.panels?.length === MONITORS)
  await waitFor(() => stageMirrors('quickSettings').length === 1)
  await waitFor(() => stageMirrors('ArcMenu').length === 1)
}

export async function run() {
  assert(MONITORS === 2, `teardown needs --monitors 2, got ${MONITORS}`)
  await requireActive(ARCMENU)
  await requireActive(APPINDICATOR)
  const noiseBefore = logLines(TEARDOWN_NOISE).length

  await enable()
  await mirrored()

  for (let i = 0; i < 3; i++) {
    await setActive(ARCMENU, false)
    await waitFor(() => stageMirrors('ArcMenu').length === 0)
    assert(
      stageMirrors('quickSettings').length === 1,
      `arcmenu off ${i}: quick settings mirror kept`,
    )
    await setActive(ARCMENU, true)
    await mirrored()
  }

  await cycle(5)
  await mirrored()

  const noise = logLines(TEARDOWN_NOISE).slice(noiseBefore)
  assert(!noise.length, `teardown noise: ${noise.join(' | ')}`)

  done('teardown')
}
