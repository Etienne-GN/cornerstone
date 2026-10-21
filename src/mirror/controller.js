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

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import * as Utils from '../utils.js'
import { MirroredIndicatorButton } from './mirroredIndicatorButton.js'
import { clearCatalog, dtpPrimaryIndex, publishCatalog } from './catalog.js'
import { BOX_NAMES, planMirrors } from './plan.js'
import { VISIBILITY_KEY, indicatorIsEnabled, monitorKey } from './policy.js'

const ENABLED_KEY = 'mirror-indicators'
const QUICK_SETTINGS = 'quickSettings'
const REFRESH = 'refresh'
const REFRESH_DELAY_MS = 100
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
    this._signalsHandler = new Utils.GlobalSignalsHandler()
    this._timeoutsHandler = new Utils.TimeoutsHandler()

    this._signalsHandler.add(
      [
        settings,
        [`changed::${VISIBILITY_KEY}`, `changed::${ENABLED_KEY}`],
        () => this.refresh(),
      ],
      [Main.extensionManager, 'extension-state-changed', () => this.refresh()],
    )

    for (const box of BOX_NAMES) this._watch(Main.panel[BOX_ACTORS[box]])
  }

  // Called on every dash-to-panel `panels-created`.
  attach(panels) {
    this.detach()
    this._panelManager = panels[0]?.panelManager ?? null
    this._panels = panels.filter((p) => p.isStandalone && !p.isPrimary)
    this._refreshNow()
  }

  // Must run while the panels are still enabled, before dash-to-panel
  // destroys their boxes.
  detach() {
    this._timeoutsHandler.removeWithLabel(REFRESH)
    for (const panel of this._panels) {
      try {
        this._clearPanel(panel)
      } catch (e) {
        console.error('[omnibar] mirror detach', e)
      }
    }
    this._panels = []
    this._states.clear()
  }

  refresh() {
    this._timeoutsHandler.removeWithLabel(REFRESH)
    this._timeoutsHandler.addWithLabel(REFRESH, [
      REFRESH,
      REFRESH_DELAY_MS,
      () => this._refreshNow(),
    ])
  }

  destroy() {
    this.detach()
    this._timeoutsHandler.destroy()
    this._signalsHandler.destroy()
    clearCatalog(this._settings)
    for (const actor of this._watched) actor.disconnectObject(this)
    this._watched.clear()
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
    try {
      publishCatalog(this._settings, this._panelManager)
    } catch (e) {
      console.error('[omnibar] mirror catalog', e)
    }

    const enabled = this._settings.get_boolean(ENABLED_KEY)

    for (const panel of this._panels) {
      try {
        if (enabled) this._syncPanel(panel)
        else this._clearPanel(panel)
      } catch (e) {
        console.error('[omnibar] mirror refresh', e)
      }
    }
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
      }
      this._states.set(panel, state)
    }
    return state
  }

  _syncPanel(panel) {
    const state = this._stateFor(panel)
    const statusArea = Main.panel.statusArea
    // Main.panel lives on dash-to-panel's primary monitor, not necessarily
    // the system one.
    const primaryIndex = dtpPrimaryIndex(panel.panelManager)
    const key = monitorKey(global.display, panel.monitor.index, primaryIndex)
    const boxes = {}
    for (const box of BOX_NAMES)
      boxes[box] = Main.panel[BOX_ACTORS[box]]?.get_children() ?? []

    const plan = planMirrors(boxes, statusArea, (role) =>
      indicatorIsEnabled(this._settings, key, role),
    )
    const wanted = new Set(plan.map((entry) => entry.role))

    for (const [role, entry] of [...state.mirrors])
      if (!wanted.has(role) || entry.source !== statusArea[role])
        this._destroyMirror(state, role)

    const positions = { left: 0, center: 0, right: 0 }
    for (const { box, role } of plan) {
      const entry =
        state.mirrors.get(role) ?? this._createMirror(panel, state, role)
      if (!entry) continue

      this._place(
        panel,
        entry.mirror,
        panel[BOX_ACTORS[box]],
        positions[box]++,
        state.host.vertical,
      )
    }

    this._syncQuickSettings(panel, state)
  }

  _place(panel, mirror, box, position, vertical) {
    const container = mirror.container
    const parent = container.get_parent()

    if (parent !== box) {
      parent?.remove_child(container)
      box.insert_child_at_index(container, position)
      if (vertical) panel._setVertical(container, true)
    } else if (box.get_child_at_index(position) !== container) {
      box.set_child_at_index(container, position)
    }
    mirror.syncOrientation(vertical)
  }

  _createMirror(panel, state, role, track = true) {
    const source = Main.panel.statusArea[role]
    const mirror = new MirroredIndicatorButton(state.host, role)

    // An empty source gets no presence watchers; the box watchers bring
    // the role back once it has content.
    if (mirror.isEmpty) {
      mirror.destroy()
      return null
    }

    const entry = { mirror, source }
    if (track) state.mirrors.set(role, entry)
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

  // The mirror takes SYSTEM_MENU's slot in the panel's allocation map; the
  // panel's own quick settings stay cached by dash-to-panel and come back
  // when mirroring stops.
  _syncQuickSettings(panel, state) {
    const source = Main.panel.statusArea[QUICK_SETTINGS]
    if (state.quickSettings?.source === source) return

    this._destroyQuickSettings(panel, state)
    if (!source) return

    const entry = this._createMirror(panel, state, QUICK_SETTINGS, false)
    if (!entry) return

    state.quickSettings = entry
    panel.panel.add_child(entry.mirror.container)
    if (state.host.vertical) panel._setVertical(entry.mirror.container, true)
    entry.mirror.syncOrientation(state.host.vertical)
    panel.statusArea[QUICK_SETTINGS]?.container.hide()
    panel._omniSystemMenu = entry.mirror.container
    panel._setAllocationMap()
    panel.updateElementPositions()
  }

  _destroyQuickSettings(panel, state) {
    const entry = state.quickSettings
    state.quickSettings = null
    this._restoreSystemMenu(panel)
    entry?.mirror.destroy()
  }

  _restoreSystemMenu(panel) {
    if (!panel._omniSystemMenu) return

    delete panel._omniSystemMenu
    panel._setAllocationMap()
    panel.updateElementPositions()
  }

  _clearPanel(panel) {
    const state = this._states.get(panel)
    if (!state) return

    for (const role of [...state.mirrors.keys()])
      this._destroyMirror(state, role)
    this._destroyQuickSettings(panel, state)
  }
}
