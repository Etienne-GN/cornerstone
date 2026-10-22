/*
 * Adapted from Multi Monitor Bar by Frederyk Abryan Palinoan, itself
 * derived from Multi Monitors Add-On by spin83.
 *
 * Copyright (C) 2025-2026  Frederyk Abryan Palinoan
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <https://www.gnu.org/licenses/>.
 */

import GObject from 'gi://GObject'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import * as Utils from '../utils.js'
import { MirroredIndicatorButton } from './mirroredIndicatorButton.js'
import { Slots } from '../slots.js'
import { clearCatalog, dtpPrimaryIndex, publishCatalog } from './catalog.js'
import { BOX_NAMES } from './plan.js'
import { VISIBILITY_KEY, indicatorIsEnabled, monitorKey } from './policy.js'
import {
  OVERFLOW_ROLE,
  TRAY_KEY,
  planTray,
  readTrayLayout,
} from '../tray/layout.js'
import { PrimaryTray } from '../tray/primaryTray.js'
import { OverflowButton } from '../tray/overflow.js'
import { SPACING_KEY, TraySpacing } from '../tray/spacing.js'
import { indicatorNames } from '../button/indicators.js'
import { orderIndicators } from '../button/order.js'
import { OVERRIDES_KEY, buttonValue } from '../button/overrides.js'

const ENABLED_KEY = 'mirror-indicators'
const QUICK_SETTINGS = 'quickSettings'
const REFRESH = 'refresh'
const REFRESH_DELAY_MS = 100
const COLUMNS_KEY = 'tray-overflow-columns'
const INDICATOR_KEYS = [
  'button-indicator-order',
  'button-hidden-indicators',
  'button-overflow-indicators',
]
const BOX_ACTORS = {
  left: '_leftBox',
  center: '_centerBox',
  right: '_rightBox',
}

export class MirrorController {
  constructor(settings, openActionCenter = null) {
    this._settings = settings
    this._openActionCenter = openActionCenter
    this._panels = []
    this._panelManager = null
    this._states = new Map()
    this._watched = new Set()
    this._shellPanelAlive = true
    this._mainPanelGone = false
    this._slots = new Slots()
    this._primaryTray = new PrimaryTray()
    this._spacing = new TraySpacing()
    this._primaryBar = null
    this._sources = new Map()
    // Set by whoever owns the system menu slot instead (the one button).
    this.skipQuickSettings = () => false
    // Whether system indicators may go to the overflow (the one button).
    this.indicatorsInOverflow = () => false
    this._signalsHandler = new Utils.GlobalSignalsHandler()
    this._timeoutsHandler = new Utils.TimeoutsHandler()

    this._signalsHandler.add(
      [
        settings,
        [
          `changed::${VISIBILITY_KEY}`,
          `changed::${ENABLED_KEY}`,
          `changed::${TRAY_KEY}`,
          `changed::${SPACING_KEY}`,
          `changed::${OVERRIDES_KEY}`,
          ...INDICATOR_KEYS.map((key) => `changed::${key}`),
        ],
        () => this.refresh(),
      ],
      [Main.extensionManager, 'extension-state-changed', () => this.refresh()],
      [settings, `changed::${COLUMNS_KEY}`, () => this._syncColumns()],
    )

    // At shell shutdown Main.panel goes away under live mirrors; syncing
    // after that only touches disposed actors.
    Main.panel.connectObject(
      'destroy',
      () => {
        this._mainPanelGone = true
        this._onShellPanelGone()
      },
      this,
    )
    for (const box of BOX_NAMES) {
      const actor = Main.panel[BOX_ACTORS[box]]
      this._watch(actor)
      actor?.connectObject('destroy', () => this._onShellPanelGone(), this)
    }
    // Icons moved out of the top bar still show and hide themselves.
    this._watch(this._primaryTray.holder)
  }

  // Called whenever the PanelSource changes, with dash-to-panel's panels.
  attach(panels) {
    this.detach()
    this._panelManager = panels[0]?.panelManager ?? null
    this._panels = panels.filter((p) => p.isStandalone && !p.isPrimary)
    this._primaryBar = this._makePrimaryBar(panels.find((p) => p.isPrimary))
    this._refreshNow()
  }

  // GNOME's top bar, alone or as dash-to-panel's primary panel, seen as a
  // panel: its real icons are arranged by PrimaryTray, only its overflow
  // holds mirrors.
  _makePrimaryBar(dtpPrimary) {
    return {
      isPrimaryBar: true,
      monitor: {
        index: dtpPrimary?.monitor.index ?? Main.layoutManager.primaryIndex,
      },
      panel: Main.panel,
      menuManager: Main.panel.menuManager,
      statusArea: Main.panel.statusArea,
      geom: dtpPrimary?.geom ?? { position: St.Side.TOP },
      _leftBox: Main.panel._leftBox,
      _centerBox: Main.panel._centerBox,
      _rightBox: Main.panel._rightBox,
      checkIfVertical: () => dtpPrimary?.checkIfVertical() ?? false,
      _setVertical: (actor, vertical) =>
        dtpPrimary?._setVertical(actor, vertical),
    }
  }

  get _bars() {
    return this._primaryBar ? [this._primaryBar, ...this._panels] : this._panels
  }

  // The panels may already be destroyed: mirrors in their boxes went with
  // them, and the quick settings containers dash-to-panel keeps for reuse
  // get their own button back.
  detach() {
    this._timeoutsHandler.removeWithLabel(REFRESH)
    for (const panel of this._bars) {
      try {
        this._clearPanel(panel)
      } catch (e) {
        console.error('[cornerstone] mirror detach', e)
      }
    }
    this._slots.releaseAll()
    this._panels = []
    this._primaryBar = null
    this._states.clear()
  }

  refresh() {
    this._timeoutsHandler.removeWithLabel(REFRESH)
    if (!this._shellPanelAlive) return

    this._timeoutsHandler.addWithLabel(REFRESH, [
      REFRESH,
      REFRESH_DELAY_MS,
      () => this._refreshNow(),
    ])
  }

  destroy() {
    this.detach()
    this._spacing.restoreAll()
    // After the mirrors, which clone the icons it holds.
    try {
      this._primaryTray.destroy()
    } catch (e) {
      console.error('[cornerstone] tray restore', e)
    }
    this._timeoutsHandler.destroy()
    this._signalsHandler.destroy()
    clearCatalog(this._settings)
    for (const actor of this._watched) actor.disconnectObject(this)
    this._watched.clear()
    if (!this._mainPanelGone) Main.panel.disconnectObject(this)
  }

  _onShellPanelGone() {
    this._shellPanelAlive = false
    this._timeoutsHandler.removeWithLabel(REFRESH)
  }

  // Extensions may populate a wrapper or reveal a hidden indicator without
  // adding a child to a primary box, so the whole subtree is watched.
  _watch(actor) {
    if (!actor || this._watched.has(actor)) return

    this._watched.add(actor)
    actor.connectObject(
      'notify::visible',
      () => this.refresh(),
      'destroy',
      () => this._watched.delete(actor),
      this,
    )
    // Clutter child signal names differ across supported versions.
    for (const signal of ['child-added', 'actor-added'])
      if (GObject.signal_lookup(signal, actor.constructor.$gtype))
        actor.connectObject(
          signal,
          (_actor, child) => {
            this._watch(child)
            this.refresh()
          },
          this,
        )
    for (const signal of ['child-removed', 'actor-removed'])
      if (GObject.signal_lookup(signal, actor.constructor.$gtype))
        actor.connectObject(
          signal,
          (_actor, child) => {
            this._unwatch(child)
            this.refresh()
          },
          this,
        )
    for (const child of actor.get_children()) this._watch(child)
  }

  _unwatch(actor) {
    if (!this._watched.delete(actor)) return

    actor.disconnectObject(this)
    for (const child of actor.get_children()) this._unwatch(child)
  }

  _refreshNow() {
    if (!this._shellPanelAlive) return

    const enabled = this._settings.get_boolean(ENABLED_KEY)

    try {
      this._sources = new Map(
        this._primaryTray.sources().map((source) => [source.role, source]),
      )
    } catch (e) {
      console.error('[cornerstone] tray sources', e)
    }

    try {
      publishCatalog(this._settings, this._panelManager, [
        ...this._sources.values(),
      ])
    } catch (e) {
      console.error('[cornerstone] mirror catalog', e)
    }

    const primary = this._primaryBar
    if (primary) {
      try {
        this._syncPanel(primary)
        this._primaryTray.apply(
          this._itemsFor(primary),
          this._states.get(primary)?.overflow?.container ?? null,
        )
        const px = this._spacingFor(primary)
        for (const role of this._sources.keys())
          this._spacing.apply(Main.panel.statusArea[role], px)
      } catch (e) {
        console.error('[cornerstone] tray refresh', e)
      }
    }

    for (const panel of this._panels) {
      try {
        if (enabled) this._syncPanel(panel)
        else this._clearPanel(panel)
      } catch (e) {
        console.error('[cornerstone] mirror refresh', e)
      }
    }
  }

  // Tray icon padding on the panel, in pixels; -1 for the theme's. Vertical
  // bars keep their own.
  _spacingFor(panel) {
    if (panel.checkIfVertical()) return -1
    return this._settings.get_int(SPACING_KEY)
  }

  _keyFor(panel) {
    // Main.panel lives on dash-to-panel's primary monitor, not necessarily
    // the system one.
    const primaryIndex = dtpPrimaryIndex(this._panelManager)
    return monitorKey(global.display, panel.monitor.index, primaryIndex)
  }

  // The system indicators the panel's monitor puts in the overflow, in the
  // button's order.
  _overflowIndicators(panel) {
    const quickSettings = Main.panel.statusArea.quickSettings
    if (!this.indicatorsInOverflow() || !quickSettings?._indicators) return []

    const key = this._keyFor(panel)
    const value = (name) => buttonValue(this._settings, key, name)
    const hidden = new Set(value('button-hidden-indicators'))
    const wanted = new Set(value('button-overflow-indicators'))
    return orderIndicators(
      indicatorNames(quickSettings),
      value('button-indicator-order'),
    )
      .filter(({ name }) => wanted.has(name) && !hidden.has(name))
      .map(({ child }) => child)
  }

  // The tray layout of the panel's monitor, for the icons present now.
  _itemsFor(panel) {
    const key = this._keyFor(panel)
    const sources = [...this._sources.values()].map(({ role, box }) => ({
      role,
      box,
    }))
    return planTray(sources, readTrayLayout(this._settings)[key], (role) =>
      indicatorIsEnabled(this._settings, key, role) ? 'shown' : 'hidden',
    )
  }

  _stateFor(panel) {
    let state = this._states.get(panel)
    if (!state) {
      state = {
        host: {
          monitorIndex: panel.monitor.index,
          menuManager: panel.panel.menuManager ?? panel.menuManager,
          vertical: panel.checkIfVertical(),
          openActionCenter: (actor) => this._openActionCenter?.(actor) ?? false,
        },
        mirrors: new Map(),
        quickSettings: null,
        overflow: null,
      }
      this._states.set(panel, state)
    }
    return state
  }

  _syncPanel(panel) {
    const state = this._stateFor(panel)
    const statusArea = Main.panel.statusArea
    // An icon its extension hides is not mirrored, wherever it sits.
    const planned = this._itemsFor(panel)
    const items = planned.filter(
      (item) =>
        item.state !== 'hidden' &&
        statusArea[item.role] &&
        this._sources.get(item.role)?.child.visible &&
        (item.state === 'overflow' || !panel.isPrimaryBar),
    )
    const placement = new Map(items.map((item) => [item.role, item.state]))

    for (const [role, entry] of [...state.mirrors])
      if (
        placement.get(role) !== entry.placement ||
        entry.source !== statusArea[role]
      )
        this._destroyMirror(state, role)

    const overflowItems = items.filter((item) => item.state === 'overflow')
    const indicators = this._overflowIndicators(panel)
    const overflow = this._syncOverflow(
      panel,
      state,
      overflowItems.length > 0 || indicators.length > 0,
    )

    const px = this._spacingFor(panel)
    this._spacing.apply(overflow, px)
    // The primary bar's icons and overflow are placed by PrimaryTray.
    const positions = { left: 0, center: 0, right: 0 }
    for (const { box, role } of panel.isPrimaryBar ? [] : planned) {
      if (role === OVERFLOW_ROLE) {
        if (overflow)
          this._place(
            panel,
            overflow.container,
            panel[BOX_ACTORS[box]],
            positions[box]++,
            state.host.vertical,
          )
        continue
      }
      if (placement.get(role) !== 'shown') continue
      const entry =
        state.mirrors.get(role) ??
        this._createMirror(panel, state, role, true, 'shown')
      if (!entry) continue

      this._place(
        panel,
        entry.mirror.container,
        panel[BOX_ACTORS[box]],
        positions[box]++,
        state.host.vertical,
      )
      entry.mirror.syncOrientation(state.host.vertical)
      this._spacing.apply(entry.mirror, px)
    }

    let index = 0
    for (const { role } of overflowItems) {
      const entry =
        state.mirrors.get(role) ??
        this._createMirror(panel, state, role, true, 'overflow')
      if (!entry) continue

      const container = entry.mirror.container
      if (container.get_parent() !== overflow.flow) {
        container.get_parent()?.remove_child(container)
        overflow.flow.insert_child_at_index(container, index)
      } else if (overflow.flow.get_child_at_index(index) !== container) {
        overflow.flow.set_child_at_index(container, index)
      }
      entry.mirror.syncOrientation(false)
      index++
    }
    overflow?.setIndicators(indicators, (button) =>
      this._openActionCenter?.(button),
    )
    // The flow keeps the popup sized; drop the overflow once it is empty.
    if (overflow && index === 0 && !indicators.length)
      this._destroyOverflow(panel, state)

    if (!panel.isPrimaryBar) this._syncQuickSettings(panel, state)
  }

  // The panel's overflow button, while it has icons to hold. It starts in
  // the right box; its item then places it.
  _syncOverflow(panel, state, wanted) {
    if (!wanted) {
      this._destroyOverflow(panel, state)
      return null
    }
    if (state.overflow) return state.overflow

    const button = new OverflowButton(
      panel.geom?.position ?? St.Side.TOP,
      this._settings.get_int(COLUMNS_KEY),
    )
    state.overflow = button
    panel._rightBox.insert_child_at_index(button.container, 0)
    if (state.host.vertical) panel._setVertical(button.container, true)
    state.host.menuManager?.addMenu(button.menu)
    state.overflowHost = { ...state.host, anchor: () => button }
    button.connectObject(
      'destroy',
      () => {
        if (state.overflow === button) state.overflow = null
      },
      this,
    )
    return button
  }

  _syncColumns() {
    const columns = this._settings.get_int(COLUMNS_KEY)
    for (const state of this._states.values())
      state.overflow?.setColumns(columns)
  }

  _destroyOverflow(panel, state) {
    const button = state.overflow
    if (!button) return

    state.overflow = null
    for (const [role, entry] of [...state.mirrors])
      if (entry.placement === 'overflow') this._destroyMirror(state, role)
    state.host.menuManager?.removeMenu(button.menu)
    button.destroy()
  }

  _place(panel, container, box, position, vertical) {
    const parent = container.get_parent()

    if (parent !== box) {
      parent?.remove_child(container)
      box.insert_child_at_index(container, position)
      if (vertical) panel._setVertical(container, true)
    } else if (box.get_child_at_index(position) !== container) {
      box.set_child_at_index(container, position)
    }
  }

  _createMirror(panel, state, role, track = true, placement = 'shown') {
    const source = Main.panel.statusArea[role]
    const host = placement === 'overflow' ? state.overflowHost : state.host
    const mirror = new MirroredIndicatorButton(host, role)

    // An empty source gets no presence watchers; the box watchers bring
    // the role back once it has content.
    if (mirror.isEmpty) {
      mirror.destroy()
      return null
    }

    const entry = { mirror, source, placement }
    if (track) state.mirrors.set(role, entry)
    if (placement === 'overflow') state.overflow?.adopt(mirror)
    mirror.connectObject(
      'destroy',
      () => this._onMirrorDestroyed(panel, state, role, entry),
      this,
    )
    return entry
  }

  _onMirrorDestroyed(panel, state, role, entry) {
    if (state.quickSettings === entry) {
      state.quickSettings = null
      this._restoreSystemMenu(panel)
    } else if (state.mirrors.get(role) === entry) {
      state.mirrors.delete(role)
    } else {
      return
    }
    this.refresh()
  }

  _destroyMirror(state, role) {
    const entry = state.mirrors.get(role)
    state.mirrors.delete(role)
    entry?.mirror.destroy()
  }

  // The mirror takes the panel's quick settings container, so dash-to-panel
  // keeps positioning it; the panel's own button comes back when mirroring
  // stops.
  _syncQuickSettings(panel, state) {
    const source = Main.panel.statusArea[QUICK_SETTINGS]
    const container = panel.statusArea?.[QUICK_SETTINGS]?.container
    const current = state.quickSettings
    if (
      current?.source === source &&
      container &&
      this._slots.owner(container) === current.mirror.container &&
      !this.skipQuickSettings()
    )
      return

    this._destroyQuickSettings(panel, state)
    if (!source || !container || this.skipQuickSettings()) return

    const entry = this._createMirror(panel, state, QUICK_SETTINGS, false)
    if (!entry) return

    state.quickSettings = entry
    this._slots.swap(container, entry.mirror.container)
    if (state.host.vertical) panel._setVertical(entry.mirror.container, true)
    entry.mirror.syncOrientation(state.host.vertical)
  }

  _destroyQuickSettings(panel, state) {
    const entry = state.quickSettings
    state.quickSettings = null
    this._restoreSystemMenu(panel)
    entry?.mirror.destroy()
  }

  _restoreSystemMenu(panel) {
    const container = panel.statusArea?.[QUICK_SETTINGS]?.container
    if (container) this._slots.release(container)
  }

  _clearPanel(panel) {
    const state = this._states.get(panel)
    if (!state) return

    for (const role of [...state.mirrors.keys()])
      this._destroyMirror(state, role)
    this._destroyOverflow(panel, state)
    if (!panel.isPrimaryBar) this._destroyQuickSettings(panel, state)
  }
}
