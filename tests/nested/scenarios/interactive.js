import { assertIsolated, enable } from '../lib.js'

// Viewer mode: never resolves, so the automation runner never quits the
// shell. The run ends when the shell exits.
export async function run() {
  await enable()
  assertIsolated()
  console.log('[cornerstone-test] READY')
  await new Promise(() => {})
}
