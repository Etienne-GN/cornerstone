/*
 * Routes GNOME Shell's clock, quick settings, keyboard shortcuts, close
 * calls and notification banner clicks to the Action Center.
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
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js'

import { animateFromArg } from '../compat.js'

const BANNER_CLICK_KEY = 'action-center-banner-click'
const BANNER_OPENS_ACTION_CENTER = 'open-action-center'
const BUTTON_ROLES = ['dateMenu', 'quickSettings']

export function pickPanelForMonitor(panels, index) {
  if (!panels?.length) return null

  return (
    panels.find((p) => p.monitor?.index === index) ??
    panels.find((p) => p.isPrimary) ??
    panels[0]
  )
}

export function monitorIndexAt(monitors, x, y, fallback) {
  const monitor = monitors.find(
    (m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height,
  )
  return monitor ? monitor.index : fallback
}

// BoxPointer positions against the source allocation; an unallocated source
// gives it NaN for a frame.
export function isUsableSource(actor) {
  return (
    !!actor &&
    actor.mapped &&
    actor.has_allocation() &&
    actor.width > 0 &&
    actor.height > 0
  )
}

// InjectionManager puts an inherited method back as an own property; drop
// that copy so the instance inherits from its prototype again.
export class InstanceOverrides {
  constructor() {
    this._injections = new InjectionManager()
    this._inherited = []
  }

  override(obj, name, factory) {
    if (!Object.hasOwn(obj, name)) this._inherited.push([obj, name])
    this._injections.overrideMethod(obj, name, factory)
  }

  clear() {
    this._injections.clear()
    for (const [obj, name] of this._inherited) {
      if (obj[name] === Object.getPrototypeOf(obj)[name]) delete obj[name]
    }
    this._inherited = []
  }
}

export class ActionCenterRouter {
  constructor(actionCenter, getPanels, settings) {
    this._ac = actionCenter
    this._getPanels = getPanels
    this._settings = settings
    this._overrides = null
    this._buttonMenus = new Set()
    this._banners = new Set()
  }

  enable() {
    if (this._overrides) return

    this._overrides = new InstanceOverrides()
    const router = this
    const ac = this._ac
    const panel = Main.panel

    for (const name of ['toggleCalendar', 'toggleQuickSettings'])
      this._overrides.override(panel, name, () => () => router._toggle())
    for (const name of ['closeCalendar', 'closeQuickSettings'])
      this._overrides.override(panel, name, () => () => ac.close())

    // status/system.js closes the menu itself before taking a screenshot.
    const qsMenu = panel.statusArea.quickSettings?.menu
    if (qsMenu)
      this._overrides.override(
        qsMenu,
        'close',
        (original) =>
          function (...args) {
            if (ac.isOpen) ac.close(animateFromArg(args[0]))
            return original.apply(this, args)
          },
      )

    this._overrideButtons()
    global.dashToPanel?.connectObject(
      'panels-created',
      () => this._overrideButtons(),
      this,
    )

    this._watchBanners()
  }

  disable() {
    if (!this._overrides) return

    global.dashToPanel?.disconnectObject(this)
    Main.messageTray._bannerBin?.disconnectObject(this)
    for (const banner of this._banners) banner.disconnectObject(this)
    this._banners.clear()
    this._buttonMenus.clear()
    this._overrides.clear()
    this._overrides = null
  }

  monitorUnderPointer() {
    const [x, y] = global.get_pointer()
    return monitorIndexAt(
      Main.layoutManager.monitors,
      x,
      y,
      Main.layoutManager.primaryIndex,
    )
  }

  sourceForMonitor(index) {
    const panels = this._getPanels() ?? []
    const candidates = []
    for (const panel of [
      pickPanelForMonitor(panels, index),
      panels.find((p) => p.isPrimary),
    ]) {
      if (!panel) continue
      const mirror = panel._omniSystemMenu
      candidates.push(
        panel.statusArea?.dateMenu,
        mirror?.child ?? mirror,
        panel.statusArea?.quickSettings,
        panel.panel,
      )
    }
    for (const role of BUTTON_ROLES)
      candidates.push(Main.panel.statusArea[role])

    return candidates.find(isUsableSource) ?? null
  }

  // Keyboard shortcuts open on the monitor under the pointer, like the
  // rest of the shell does for new windows.
  _toggle() {
    if (this._ac.isOpen) {
      this._ac.close()
      return
    }

    const index = this.monitorUnderPointer()
    pickPanelForMonitor(this._getPanels(), index)?.intellihide?.revealAndHold(
      0,
      true,
    )
    const source = this.sourceForMonitor(index)
    if (!source || !this._ac.open(source)) return

    this._ac.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false)
  }

  _sourceFor(button) {
    if (isUsableSource(button)) return button
    return this.sourceForMonitor(Main.layoutManager.findIndexForActor(button))
  }

  // dash-to-panel keeps the secondary buttons across `_reset`, so each menu
  // is overridden once per enable.
  _overrideButtons() {
    const statusAreas = new Set([Main.panel.statusArea])
    for (const panel of this._getPanels() ?? [])
      if (panel.statusArea) statusAreas.add(panel.statusArea)

    for (const statusArea of statusAreas) {
      for (const role of BUTTON_ROLES) {
        const button = statusArea[role]
        if (button?.menu) this._overrideButton(button)
      }
    }
  }

  _overrideButton(button) {
    const menu = button.menu
    if (this._buttonMenus.has(menu)) return

    this._buttonMenus.add(menu)

    const ac = this._ac
    this._overrides.override(menu, 'toggle', () => () => {
      const source = this._sourceFor(button)
      if (source) ac.toggle(source)
    })
    // PopupMenuManager opens the hovered button's menu while another one
    // of the same bar is open.
    this._overrides.override(menu, 'open', () => () => {
      const source = this._sourceFor(button)
      return !!source && ac.open(source)
    })
  }

  _watchBanners() {
    const bin = Main.messageTray._bannerBin
    if (!bin) {
      console.error(
        '[omnibar] action center: banner container not found',
        new Error('Main.messageTray._bannerBin is missing'),
      )
      return
    }

    bin.connectObject(
      'child-added',
      (_, child) => this._watchBanner(child),
      this,
    )
    for (const child of bin.get_children()) this._watchBanner(child)
  }

  // Stopping `clicked` before its class handler is how messageList.js keeps
  // a notification from activating; the banner's own close and action
  // buttons keep working.
  _watchBanner(banner) {
    if (
      this._banners.has(banner) ||
      !banner.notification ||
      !GObject.signal_lookup('clicked', banner.constructor.$gtype)
    )
      return

    this._banners.add(banner)
    banner.connectObject(
      'clicked',
      () => this._onBannerClicked(banner),
      'destroy',
      () => this._banners.delete(banner),
      this,
    )
  }

  _onBannerClicked(banner) {
    if (
      this._settings.get_string(BANNER_CLICK_KEY) !== BANNER_OPENS_ACTION_CENTER
    )
      return

    const index = Main.layoutManager.findIndexForActor(banner)
    const source = this.sourceForMonitor(index)
    if (!source) return

    GObject.signal_stop_emission_by_name(banner, 'clicked')
    this._ac.open(source)
  }
}
