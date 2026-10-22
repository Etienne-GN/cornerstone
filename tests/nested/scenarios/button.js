// The one button: placed on every bar in the date menu slot, the system
// menu slot hidden, following dash-to-panel rebuilds and restarts, and
// restoring both slots when turned off or disabled.
//
// Run with --monitors 2, and with --no-dtp for GNOME's top bar.

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js'

import {
  DTP,
  DTP_UUID,
  MONITORS,
  VERTICAL,
  assert,
  assertSlotsRestored,
  bars,
  captureStage,
  disable,
  done,
  dtpSettings,
  enable,
  ext,
  sleep,
  statusAreas,
  waitFor,
} from '../lib.js'

const oneButton = () => ext().stateObj.oneButton
const settings = () => ext().stateObj.getSettings()
const ac = () => ext().stateObj.actionCenter

function buttonIn(area) {
  const child = area.dateMenu?.container.get_child()
  const button = child?.child
  return button?._cornerstoneButton ? button : null
}

function assertPlaced(what) {
  const areas = statusAreas()
  for (const [i, area] of areas.entries()) {
    const button = buttonIn(area)
    assert(button, `${what}: no button in date menu slot #${i}`)
    assert(button.mapped, `${what}: button #${i} not mapped`)
    const [w, h] = button.get_transformed_size()
    assert(w > 0 && h > 0, `${what}: button #${i} has no size`)
    assert(
      !area.quickSettings?.container.visible,
      `${what}: system menu slot #${i} visible`,
    )
  }
  return areas.map(buttonIn)
}

async function setDtp(enabled) {
  if (enabled) Main.extensionManager.enableExtension(DTP_UUID)
  else Main.extensionManager.disableExtension(DTP_UUID)
  const want = enabled ? ExtensionState.ACTIVE : ExtensionState.INACTIVE
  await waitFor(() => Main.extensionManager.lookup(DTP_UUID).state === want)
}

export async function run() {
  await bars()
  await enable()
  await waitFor(() => oneButton()?.isActive)
  await sleep(300)

  let buttons = assertPlaced('enabled')
  assert(
    buttons.length === (DTP ? MONITORS : 1),
    `expected one button per bar, got ${buttons.length}`,
  )
  const [first] = buttons
  const clock = first._elements.clock
  const strip = first._elements.indicators
  assert(clock.text.length > 0, 'clock shows text')
  assert(
    strip.get_children().some((c) => c.visible),
    'at least one system indicator shown',
  )
  console.log(`[cornerstone-test] clock "${clock.text}", indicators ` +
    strip.get_children().filter((c) => c.visible).map((c) => c._cornerstoneIndicator))
  await captureStage('1-buttons')

  const last = buttons.at(-1)
  last._activate(last)
  await waitFor(() => ac().isOpen)
  assert(ac()._source === last, 'Action Center anchored to the clicked button')
  assert(last.has_style_pseudo_class('active'), 'button shows :active')
  await sleep(300)
  await captureStage('2-open')
  last._activate(last)
  await waitFor(() => !ac().isOpen)

  const s = settings()
  s.set_string('clock-format', '%a %d  %H:%M:%S')
  s.set_string('clock-font', 'Sans Bold 13')
  s.set_strv('button-elements', ['clock', 'indicators'])
  s.set_int('button-spacing', 20)
  await sleep(1200)
  assert(first._box.style.includes('20px'), `spacing: "${first._box.style}"`)
  assert(/\d\d:\d\d:\d\d$/.test(clock.text), `custom format: "${clock.text}"`)
  assert(clock.style.includes('font-weight: 700'), `font: "${clock.style}"`)
  assert(first._box.get_first_child() === clock, 'clock moved first')
  const visible = strip.get_children().filter((c) => c.visible)
  const hiddenName = visible[0]._cornerstoneIndicator
  s.set_strv('button-hidden-indicators', [hiddenName])
  await sleep(100)
  assert(
    !strip.get_children().some((c) => c._cornerstoneIndicator === hiddenName),
    `${hiddenName} hidden`,
  )
  await captureStage('3-customized')
  for (const key of [
    'clock-format',
    'clock-font',
    'button-elements',
    'button-hidden-indicators',
    'button-spacing',
  ])
    s.reset(key)

  // Per monitor: the second bar gets its own clock and elements, the
  // first keeps following every monitor.
  if (DTP && MONITORS > 1) {
    const [main, other] = buttons
    const key = other._config.monitor
    assert(main._config.monitor === 'main', `top bar key ${main._config.monitor}`)
    assert(key !== 'main', `second bar key ${key}`)
    other._config.setOverride(true)
    other._config.set_string('clock-format', 'OWN %H')
    other._config.set_strv('button-elements', ['clock'])
    await sleep(200)
    assert(other._elements.clock.text.startsWith('OWN'), 'own clock format')
    assert(
      !other._elements.indicators.get_parent(),
      'own elements: indicators left out',
    )
    assert(!main._elements.clock.text.startsWith('OWN'), 'top bar unchanged')
    assert(main._elements.indicators.get_parent(), 'top bar keeps indicators')

    s.set_string('clock-font', 'Sans Bold 14')
    await sleep(100)
    assert(main._elements.clock.style.includes('700'), 'global font applied')
    assert(!other._elements.clock.style, 'override keeps its own font')
    s.reset('clock-font')
    await captureStage('7-per-monitor')

    // Overrides survive a rebuild: the new button reads them again.
    dtpSettings().set_boolean('multi-monitors', false)
    await waitFor(() => global.dashToPanel?.panels?.length === 1)
    dtpSettings().set_boolean('multi-monitors', true)
    await bars()
    await sleep(300)
    const rebuilt = assertPlaced('rebuilt with an override').at(-1)
    assert(rebuilt._config.monitor === key, 'rebuilt button keeps its key')
    assert(rebuilt._elements.clock.text.startsWith('OWN'), 'override after rebuild')

    rebuilt._config.setOverride(false)
    await sleep(100)
    assert(!rebuilt._elements.clock.text.startsWith('OWN'), 'override off')
    assert(rebuilt._elements.indicators.get_parent(), 'indicators back')
    assert(s.get_string('button-monitor-overrides') === '{}', 'override removed')
    buttons = assertPlaced('after per-monitor')
  }

  if (DTP && VERTICAL) {
    const positions = Object.fromEntries(
      global.dashToPanel.panels.map((p) => [p.monitor.index, 'LEFT']),
    )
    dtpSettings().set_string('panel-positions', JSON.stringify(positions))
    await waitFor(() =>
      global.dashToPanel?.panels?.every((p) => p.checkIfVertical()),
    )
    await bars()
    await sleep(500)
    buttons = assertPlaced('vertical bars')
    assert(
      buttons.every((b) => b._vertical),
      'buttons stack vertically on side bars',
    )
    await captureStage('6-vertical')
    dtpSettings().set_string('panel-positions', '{}')
    await waitFor(() =>
      global.dashToPanel?.panels?.every((p) => !p.checkIfVertical()),
    )
    await bars()
  }

  if (DTP) {
    dtpSettings().set_boolean('multi-monitors', false)
    await waitFor(() => global.dashToPanel?.panels?.length === 1)
    dtpSettings().set_boolean('multi-monitors', true)
    await bars()
    await sleep(300)
    assertPlaced('after a dash-to-panel rebuild')

    await setDtp(false)
    await sleep(300)
    assertPlaced('dash-to-panel disabled')
    await captureStage('4-top-bar')
    await setDtp(true)
    await bars()
    await sleep(300)
    assertPlaced('dash-to-panel enabled again')
  }

  s.set_boolean('one-button', false)
  await waitFor(() => !oneButton().isActive)
  assertSlotsRestored('one button off')
  s.set_boolean('one-button', true)
  await waitFor(() => oneButton().isActive)
  await sleep(300)
  assertPlaced('one button on again')

  s.set_boolean('action-center', false)
  await waitFor(() => !oneButton().isActive)
  assertSlotsRestored('Action Center off')
  s.set_boolean('action-center', true)
  await waitFor(() => oneButton().isActive)
  await sleep(300)
  assertPlaced('Action Center on again')

  await disable()
  assertSlotsRestored('after disable')
  await captureStage('5-disabled')
  done('button')
}
