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

// Run with --monitors 2 --with-extension clipboard-history@alexsaveau.dev:
// its indicator is mirrored through a static icon copy.

export const METRICS = {}

const CLIPBOARD = 'clipboard-history@alexsaveau.dev'
const OFF_STAGE = /which is not in the stage/

function clipboardMirrors(actor = global.stage, found = []) {
  if (actor._omniMirror && actor._isClipboardIndicator()) found.push(actor)
  for (const child of actor.get_children()) clipboardMirrors(child, found)
  return found
}

export async function run() {
  assert(MONITORS === 2, `static-copy needs --monitors 2, got ${MONITORS}`)
  const extension = Main.extensionManager.lookup(CLIPBOARD)
  assert(extension, `${CLIPBOARD} missing: run with --with-extension`)
  await waitFor(() => extension.state === ExtensionState.ACTIVE)
  const before = logLines(OFF_STAGE).length

  await enable()
  const [mirror] = await waitFor(() => {
    const found = clipboardMirrors()
    return found.length === 1 && found
  })
  await waitFor(() => mirror.mapped && mirror.width > 0)
  const copy = await waitFor(() =>
    mirror
      .get_children()
      .flatMap((c) => [c, ...c.get_children()])
      .find((a) => a.has_style_class_name?.('mm-static-indicator-copy')),
  )
  await waitFor(() => copy.width > 0 && copy.height > 0)

  await cycle(3)
  await waitFor(() => clipboardMirrors().length === 1)

  const offStage = logLines(OFF_STAGE).slice(before)
  assert(!offStage.length, `off-stage theme lookups: ${offStage.join(' | ')}`)

  done('static-copy')
}
