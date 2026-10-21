/*
 * Hosts GNOME Shell's own quick settings grid, message list and calendar
 * column in one popup. The open/dim/offset logic replicates GNOME Shell's
 * dateMenu.js and quickSettings.js (GPL-2.0-or-later).
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

import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl'
import GLib from 'gi://GLib'
import Graphene from 'gi://Graphene'
import Meta from 'gi://Meta'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import { POPUP_ANIMATION_TIME } from 'resource:///org/gnome/shell/ui/quickSettings.js'

import { menuClose, menuOpen, verticalBoxProps } from '../compat.js'
import { ActionCenterRouter, InstanceOverrides } from './router.js'
import { WidgetMover } from './widgetMover.js'

// quickSettings.js keeps this private.
const DIM_BRIGHTNESS = -0.4
const DIM_PROPERTY = '@effects.dim.brightness'
const ENABLED_KEY = 'action-center'

class ActionCenterMenu extends PopupMenu.PopupMenu {
  constructor(qsMenu) {
    super(null, 0.5, St.Side.TOP)

    this._qsMenu = qsMenu

    // Like QuickSettingsMenu: a 0x0 actor so the toggle submenu overlay can
    // sit beside the boxpointer instead of inside it.
    this.actor = new St.Widget({ reactive: true, width: 0, height: 0 })
    this.actor.add_child(this._boxPointer)
    this.actor._delegate = this
    global.focus_manager.add_group(this.actor)
    this.connect('menu-closed', () => this.actor.hide())

    // 51 menus wrap keynav vertically by default; St.KeynavFlags is new in 51.
    if (St.KeynavFlags) this._boxPointer.set_keynav_flags(St.KeynavFlags.NONE)
    this._dimEffect = new Clutter.BrightnessContrastEffect({ enabled: false })
    this._boxPointer.add_effect_with_name('dim', this._dimEffect)

    this.box.add_style_class_name('quick-settings')
    this.box.add_style_class_name('omni-action-center-popover')

    this.content = new St.BoxLayout({
      style_class: 'omni-action-center',
      x_expand: true,
      y_expand: true,
      ...verticalBoxProps(),
    })
    this.box.add_child(this.content)

    this.qsHost = this._addHost('omni-action-center-quick-settings', false)
    this.messagesHost = this._addHost('omni-action-center-messages', true)
    this.calendarHost = this._addHost('omni-action-center-calendar', false)
  }

  _addHost(styleClass, yExpand) {
    const host = new St.BoxLayout({
      style_class: styleClass,
      x_expand: true,
      y_expand: yExpand,
      ...verticalBoxProps(),
    })
    this.content.add_child(host)
    return host
  }

  // `arg` is a PopupAnimation up to 50 and a params object from 51; the
  // toggle submenus take the same shape. The submenu goes first so modal
  // grabs are popped in the order they were pushed.
  close(arg) {
    this._qsMenu?._activeMenu?.close(arg)
    return super.close(arg)
  }

  setDimmed(dim) {
    const val = 127 * (1 + (dim ? 1 : 0) * DIM_BRIGHTNESS)
    const color = new Cogl.Color({
      red: val,
      green: val,
      blue: val,
      alpha: 255,
    })

    this._boxPointer.ease_property(DIM_PROPERTY, color, {
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      duration: POPUP_ANIMATION_TIME,
      onStopped: () => {
        if (this._dimEffect) this._dimEffect.enabled = dim
      },
    })
    this._dimEffect.enabled = true
  }

  // A dim easing still running would reach the effect after it is disposed.
  destroy() {
    this._boxPointer.remove_transition(DIM_PROPERTY)
    this._dimEffect = null
    super.destroy()
  }
}

export class ActionCenter {
  constructor(settings) {
    this._settings = settings
    this._menu = null
    this._source = null
    this._router = null
    this._settingId = 0
  }

  // Follows the action-center key until destroy().
  watchSetting() {
    if (!this._settingId)
      this._settingId = this._settings.connect(`changed::${ENABLED_KEY}`, () =>
        this._syncSetting(),
      )
    this._syncSetting()
  }

  destroy() {
    if (this._settingId) this._settings.disconnect(this._settingId)
    this._settingId = 0
    this.disable()
  }

  _syncSetting() {
    if (this._settings.get_boolean(ENABLED_KEY)) this.enable()
    else this.disable()
  }

  get isEnabled() {
    return !!this._menu
  }

  get isOpen() {
    return this._menu?.isOpen ?? false
  }

  get actor() {
    return this._menu?.actor ?? null
  }

  enable() {
    if (this._menu) return

    try {
      this._enable()
    } catch (e) {
      console.error('[omnibar] action center: enable failed', e)
      this.disable()
    }
  }

  _enable() {
    const dateMenu = Main.panel.statusArea.dateMenu
    const qsMenu = Main.panel.statusArea.quickSettings?.menu
    if (!dateMenu?._messageList || !qsMenu?._grid || !qsMenu._overlay) {
      console.error(
        '[omnibar] action center: GNOME widgets not found',
        new Error('missing dateMenu or quickSettings internals'),
      )
      return
    }

    this._dateMenu = dateMenu
    this._qsMenu = qsMenu
    this._calendarColumn = dateMenu._calendar.get_parent()

    if (dateMenu.menu.isOpen) menuClose(dateMenu.menu, { animate: false })
    if (qsMenu.isOpen) menuClose(qsMenu, { animate: false })

    const menu = new ActionCenterMenu(qsMenu)
    this._menu = menu
    this._mover = new WidgetMover()
    this._injections = new InstanceOverrides()
    Main.uiGroup.add_child(menu.actor)
    menu.actor.hide()
    this._manager = new PopupMenu.PopupMenuManager(menu.actor)
    this._manager.addMenu(menu)
    menu.connect('open-state-changed', (_, isOpen) =>
      this._onOpenStateChanged(isOpen),
    )
    global.display.connectObject(
      'workareas-changed',
      () => {
        if (menu.isOpen) this._fitToSource(this._source)
      },
      this,
    )

    this._mover.move(qsMenu._grid, menu.qsHost)
    this._mover.move(qsMenu._overlay, menu.actor)
    this._mover.move(dateMenu._messageList, menu.messagesHost)
    this._mover.move(this._calendarColumn, menu.calendarHost)

    this._bindOverlay()

    this._injections.override(
      qsMenu,
      '_setDimmed',
      () => (dim) => menu.setDimmed(dim),
    )

    this._captureMessageList()

    this._router = new ActionCenterRouter(
      this,
      () => global.dashToPanel?.panels ?? [],
      this._settings,
    )
    this._router.enable()
  }

  disable() {
    if (!this._menu) return

    const menu = this._menu
    const qsMenu = this._qsMenu
    const dateMenu = this._dateMenu

    this._step('router', () => this._router?.disable())
    this._router = null
    this._step('closing', () => {
      if (menu.isOpen) menuClose(menu, { animate: false })
    })
    this._step('releasing the source', () => this._setSource(null))
    global.display.disconnectObject(this)
    this._step('message list capture', () => this._releaseMessageList())
    this._step('overlay constraints', () => this._unbindOverlay())
    this._step('dim override', () => this._injections.clear())
    this._step('widgets', () => this._mover.restoreAll())

    // Never let menu.destroy() take a GNOME widget with it.
    this._step('safety pass', () => {
      for (const actor of [
        qsMenu._grid,
        qsMenu._overlay,
        dateMenu._messageList,
        this._calendarColumn,
      ]) {
        if (!menu.actor.contains(actor)) continue
        console.error(
          '[omnibar] action center: widget still hosted after restore',
          new Error(String(actor)),
        )
        actor.get_parent().remove_child(actor)
      }
    })

    if (this._bannerBlocked) {
      Main.messageTray.bannerBlocked = false
      this._bannerBlocked = false
    }

    this._step('destroying the menu', () => {
      menu._qsMenu = null
      menu.destroy()
    })

    this._menu = null
    this._manager = null
    this._mover = null
    this._injections = null
    this._qsMenu = null
    this._dateMenu = null
    this._calendarColumn = null
  }

  open(sourceActor, { animate = true } = {}) {
    if (!this._menu || !sourceActor) return false

    if (this._menu.isOpen) {
      if (sourceActor === this._source) return true
      menuClose(this._menu, { animate: false })
    }

    this._setSource(sourceActor)
    this._fitToSource(sourceActor)
    this._menu.actor.show()
    menuOpen(this._menu, { animate })
    return this._menu.isOpen
  }

  close({ animate = true } = {}) {
    if (this._menu?.isOpen) menuClose(this._menu, { animate })
  }

  toggle(sourceActor) {
    if (this.isOpen && sourceActor === this._source) this.close()
    else this.open(sourceActor)
  }

  _step(what, fn) {
    try {
      fn()
    } catch (e) {
      console.error(`[omnibar] action center: ${what} failed`, e)
    }
  }

  _setSource(actor) {
    if (actor === this._source) return

    this._source?.disconnectObject(this)
    this._source = actor
    this._menu.sourceActor = actor
    this._menu.focusActor = actor

    actor?.connectObject(
      'notify::mapped',
      () => {
        if (!actor.mapped) this.close({ animate: false })
      },
      'destroy',
      () => {
        this.close({ animate: false })
        if (this._source === actor) {
          this._source = null
          this._menu.sourceActor = null
          this._menu.focusActor = null
        }
      },
      this,
    )
  }

  _fitToSource(sourceActor) {
    const panel = global.dashToPanel?.panels?.find(
      (p) => p.panelBox?.contains(sourceActor) || p.contains?.(sourceActor),
    )
    const boxPointer = this._menu._boxPointer
    boxPointer._userArrowSide = panel?.geom?.position ?? St.Side.TOP

    const monitorIndex = Main.layoutManager.findIndexForActor(sourceActor)
    const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex)
    const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor
    const margins = boxPointer.margin_top + boxPointer.margin_bottom
    const maxHeight = Math.round((workArea.height - margins) / scaleFactor)
    boxPointer.style = `max-height: ${maxHeight}px;`
  }

  _onOpenStateChanged(isOpen) {
    if (isOpen) {
      this._queueOffsets()

      // dateMenu.js: whenever the menu is opened, select today.
      const now = new Date()
      this._dateMenu._calendar.setDate(now)
      this._dateMenu._date.setDate(now)
      this._dateMenu._eventsItem.setDate(now)
      this._source?.add_style_pseudo_class?.('active')
    } else {
      this._source?.remove_style_pseudo_class?.('active')
    }

    Main.messageTray.bannerBlocked = isOpen
    this._bannerBlocked = isOpen
  }

  // quickSettings.js binds the overlay to its own boxpointer; rebind it to
  // ours with the same offset logic while the grid is hosted here.
  _bindOverlay() {
    const overlay = this._qsMenu._overlay
    const boxPointer = this._menu._boxPointer

    this._savedConstraints = overlay.get_constraints()
    this._ownConstraints = []
    this._offsetLater = 0

    for (const c of this._savedConstraints) {
      if (
        c instanceof Clutter.BindConstraint &&
        c.source === this._qsMenu._boxPointer
      )
        overlay.remove_constraint(c)
    }

    for (const [coordinate, axis] of [
      [Clutter.BindCoordinate.X, 'x'],
      [Clutter.BindCoordinate.Y, 'y'],
    ]) {
      const constraint = new Clutter.BindConstraint({
        coordinate,
        source: boxPointer,
      })
      overlay.add_constraint(constraint)
      this._ownConstraints.push([constraint, axis])
      for (const actor of this._offsetWatched())
        actor.connectObject(`notify::${axis}`, () => this._queueOffsets(), this)
    }
  }

  _offsetWatched() {
    return [
      this._qsMenu._grid,
      this._menu.qsHost,
      this._menu.content,
      this._menu.box,
      this._menu._boxPointer.bin,
    ]
  }

  // Also queued on open: while the popup is hidden nothing is allocated and
  // the transform is not finite, so those results are skipped.
  _queueOffsets() {
    if (this._offsetLater) return

    const laters = global.compositor.get_laters()
    this._offsetLater = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
      this._offsetLater = 0
      const offset = this._qsMenu._grid.apply_relative_transform_to_point(
        this._menu._boxPointer,
        new Graphene.Point3D(),
      )
      for (const [constraint, axis] of this._ownConstraints) {
        if (Number.isFinite(offset[axis])) constraint.offset = offset[axis]
      }
      return GLib.SOURCE_REMOVE
    })
  }

  _unbindOverlay() {
    if (!this._savedConstraints) return

    if (this._offsetLater)
      global.compositor.get_laters().remove(this._offsetLater)
    this._offsetLater = 0

    for (const actor of this._offsetWatched()) actor.disconnectObject(this)

    const overlay = this._qsMenu._overlay
    overlay.clear_constraints()
    for (const c of this._savedConstraints) overlay.add_constraint(c)
    this._savedConstraints = null
    this._ownConstraints = null
  }

  _captureMessageList() {
    const messageList = this._dateMenu._messageList
    const actor = this._menu.actor

    if (typeof messageList.setCaptureContainer === 'function') {
      messageList.setCaptureContainer(actor)
      return
    }

    // dateMenu.js on 50: collapse an expanded group on outside events.
    const collapse = (_, event) =>
      messageList.maybeCollapseMessageGroupForEvent(event)
    actor.connectObject(
      'captured-event::button',
      collapse,
      'captured-event::touch',
      collapse,
      'captured-event::key',
      collapse,
      this,
    )
  }

  _releaseMessageList() {
    const messageList = this._dateMenu._messageList

    if (typeof messageList.setCaptureContainer === 'function')
      messageList.setCaptureContainer(this._dateMenu.menu.actor)
    else this._menu.actor.disconnectObject(this)
  }
}
