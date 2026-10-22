/*
 * Hosts GNOME Shell's own quick settings grid, message list and calendar
 * widgets in one popup, laid out by the action-center-layout key. The open/dim/offset logic replicates GNOME Shell's
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
import GObject from 'gi://GObject'
import Graphene from 'gi://Graphene'
import Meta from 'gi://Meta'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import { POPUP_ANIMATION_TIME } from 'resource:///org/gnome/shell/ui/quickSettings.js'

import { menuClose, menuOpen, verticalBoxProps } from '../compat.js'
import { BLOCKS, LAYOUT_KEY, parseLayout, WIDTH_BLOCKS } from './layout.js'
import { ActionCenterRouter, InstanceOverrides } from './router.js'
import { WidgetMover } from './widgetMover.js'

// quickSettings.js keeps this private.
const DIM_BRIGHTNESS = -0.4
const DIM_PROPERTY = '@effects.dim.brightness'
const ENABLED_KEY = 'action-center'
const WIDTH_KEY = 'action-center-width'

// The dateMenu.js widget each block hosts; quick settings hosts the grid.
// In the order of their GNOME parents, so a restore finds each sibling.
const DATE_BLOCKS = {
  notifications: '_messageList',
  today: '_date',
  calendar: '_calendar',
  events: '_eventsItem',
  'world-clocks': '_clocksItem',
  weather: '_weatherItem',
}
const HOST_STYLES = {
  'quick-settings': 'cornerstone-action-center-quick-settings',
  notifications: 'cornerstone-action-center-messages',
}
// The message list scrolls itself and takes the height left.
const GROWS = 'notifications'

const ALIGN = {
  fill: Clutter.ActorAlign.FILL,
  start: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  end: Clutter.ActorAlign.END,
}

// Like dateMenu.js's CalendarColumnLayout: the width comes from the shown
// `sizers` when there are any, and the other blocks wrap to it.
const ColumnLayout = GObject.registerClass(
  class ColumnLayout extends Clutter.BoxLayout {
    _init(sizers) {
      super._init(verticalBoxProps())
      this._sizers = sizers
    }

    vfunc_get_preferred_width(container, forHeight) {
      const sizers = this._sizers.filter(
        (a) => a.visible && a.get_parent() === container,
      )
      if (!sizers.length)
        return super.vfunc_get_preferred_width(container, forHeight)
      return sizers.reduce(
        ([minAcc, natAcc], child) => {
          const [min, nat] = child.get_preferred_width(forHeight)
          return [Math.max(minAcc, min), Math.max(natAcc, nat)]
        },
        [0, 0],
      )
    }
  },
)

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
    this.box.add_style_class_name('cornerstone-action-center-popover')

    this.content = new St.BoxLayout({
      style_class: 'cornerstone-action-center',
      x_expand: true,
      y_expand: true,
      ...verticalBoxProps(),
    })
    this.box.add_child(this.content)

    // One host per block for the menu's life; setLayout() moves them
    // between columns. Hidden ones wait in a hidden box that stays on
    // stage: GNOME keeps updating their widgets, and an off-stage widget
    // has no theme node to style them with.
    this._hiddenBox = new St.Widget({ visible: false })
    this.actor.add_child(this._hiddenBox)
    this.blockHosts = {}
    for (const id of BLOCKS) {
      const host = new St.BoxLayout({
        style_class: `cornerstone-action-center-block ${
          HOST_STYLES[id] ?? `cornerstone-action-center-${id}`
        }`,
        x_expand: true,
        y_expand: id === GROWS,
        ...verticalBoxProps(),
      })
      host.connect('notify::visible', () => this.syncVisibility())
      this.blockHosts[id] = host
    }
    this.rows = []
    this._layout = null
  }

  // `layout` is a parseLayout() result. Returns whether the rows were
  // rebuilt.
  setLayout(layout) {
    const key = JSON.stringify(layout)
    if (key === this._layout) return false
    this._layout = key

    for (const host of Object.values(this.blockHosts)) {
      host.get_parent()?.remove_child(host)
      this._hiddenBox.add_child(host)
    }
    for (const row of this.content.get_children()) row.destroy()

    this.rows = layout.rows.map((row) => {
      // A filling column takes the extra width; without one the row keeps
      // its natural width and `align` places it.
      const fills = row.columns.some((c) => c.width === 'fill')
      const rowBox = new St.BoxLayout({
        style_class: 'cornerstone-action-center-row',
        x_expand: true,
        x_align: fills ? Clutter.ActorAlign.FILL : ALIGN[row.align],
      })
      const columns = row.columns.map((column) => {
        const actor = this._column(column)
        rowBox.add_child(actor)
        return actor
      })
      rowBox.y_expand = columns.some((c) => c.y_expand)
      this.content.add_child(rowBox)
      return { actor: rowBox, columns }
    })
    this.syncVisibility()
    return true
  }

  _column({ width, valign, blocks }) {
    const hosts = blocks.map(({ id, align }) => {
      const host = this.blockHosts[id]
      host.x_align = ALIGN[align]
      this._hiddenBox.remove_child(host)
      return host
    })
    const sizers = blocks
      .filter(({ id }) => WIDTH_BLOCKS.includes(id))
      .map(({ id }) => this.blockHosts[id])
    const layoutManager = new ColumnLayout(sizers)
    const box = new St.Viewport({
      style_class: 'cornerstone-action-center-column',
      layout_manager: layoutManager,
      x_expand: true,
    })
    layoutManager.hookup_style(box)
    for (const host of hosts) box.add_child(host)

    // Beside the message list the column takes the row's height; elsewhere
    // it scrolls, as the calendar column's displays do in dateMenu.js.
    const grows = blocks.some(({ id }) => id === GROWS)
    const actor = grows
      ? box
      : new St.ScrollView({
          style_class: 'cornerstone-action-center-scroll vfade',
          overlay_scrollbars: true,
          hscrollbar_policy: St.PolicyType.NEVER,
          vscrollbar_policy: St.PolicyType.AUTOMATIC,
          child: box,
        })
    actor._cornerstoneHosts = hosts
    actor.x_expand = width === 'fill'
    actor.y_expand = grows
    actor.y_align = ALIGN[valign]
    return actor
  }

  // A column or row with nothing shown would still take the spacing.
  syncVisibility() {
    for (const row of this.rows ?? []) {
      for (const column of row.columns)
        column.visible = column._cornerstoneHosts.some((h) => h.visible)
      row.actor.visible = row.columns.some((c) => c.visible)
    }
  }

  // 0 lets the popup take its natural width.
  setWidth(width) {
    this.content.style = width > 0 ? `width: ${width}px;` : ''
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
    this.rows = null
    super.destroy()
  }
}

export class ActionCenter {
  // `panels` is the PanelSource.
  constructor(settings, panels) {
    this._settings = settings
    this._panels = panels
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
      console.error('[cornerstone] action center: enable failed', e)
      this.disable()
    }
  }

  _enable() {
    const dateMenu = Main.panel.statusArea.dateMenu
    const qsMenu = Main.panel.statusArea.quickSettings?.menu
    if (!dateMenu?._messageList || !qsMenu?._grid || !qsMenu._overlay) {
      console.error(
        '[cornerstone] action center: GNOME widgets not found',
        new Error('missing dateMenu or quickSettings internals'),
      )
      return
    }

    this._dateMenu = dateMenu
    this._qsMenu = qsMenu

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

    this._mover.move(qsMenu._grid, menu.blockHosts['quick-settings'])
    this._mover.move(qsMenu._overlay, menu.actor)
    // A block's host shows while GNOME shows its widget: dateMenu.js hides
    // events, clocks and weather that have nothing to show.
    this._bindings = []
    for (const [id, field] of Object.entries(DATE_BLOCKS)) {
      const widget = dateMenu[field]
      if (!widget) continue
      const host = menu.blockHosts[id]
      this._mover.move(widget, host)
      this._bindings.push(
        widget.bind_property(
          'visible',
          host,
          'visible',
          GObject.BindingFlags.SYNC_CREATE,
        ),
      )
    }

    this._bindOverlay()

    this._settings.connectObject(
      `changed::${WIDTH_KEY}`,
      () => this._syncLayout(),
      `changed::${LAYOUT_KEY}`,
      () => this._syncLayout(),
      this,
    )
    this._syncLayout()

    this._injections.override(
      qsMenu,
      '_setDimmed',
      () => (dim) => menu.setDimmed(dim),
    )

    this._captureMessageList()

    this._router = new ActionCenterRouter(this, this._panels, this._settings)
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
    this._settings.disconnectObject(this)
    this._step('visibility bindings', () => {
      for (const binding of this._bindings ?? []) binding.unbind()
    })
    this._bindings = null
    this._step('widgets', () => this._mover.restoreAll())

    // Never let menu.destroy() take a GNOME widget with it.
    this._step('safety pass', () => {
      for (const actor of [
        qsMenu._grid,
        qsMenu._overlay,
        ...Object.values(DATE_BLOCKS).map((field) => dateMenu[field]),
      ]) {
        if (!actor || !menu.actor.contains(actor)) continue
        console.error(
          '[cornerstone] action center: widget still hosted after restore',
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
  }

  _syncLayout() {
    const menu = this._menu
    menu.setWidth(this._settings.get_int(WIDTH_KEY))
    // The old columns go with a rebuild: stop watching them first.
    this._unwatchOffsets()
    menu.setLayout(parseLayout(this._settings.get_string(LAYOUT_KEY)))
    this._watchOffsets()
    this._queueOffsets()
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
      console.error(`[cornerstone] action center: ${what} failed`, e)
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
    const panel = this._panels.dtpPanels.find(
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
    }
    this._watchOffsets()
  }

  // Every actor between the grid and the boxpointer moves the overlay, and
  // so does scrolling a column that holds it.
  _watchOffsets() {
    this._unwatchOffsets()
    this._offsetWatched = []
    const queue = () => this._queueOffsets()
    const boxPointer = this._menu._boxPointer
    for (
      let actor = this._qsMenu._grid;
      actor && actor !== boxPointer;
      actor = actor.get_parent()
    ) {
      actor.connectObject('notify::x', queue, 'notify::y', queue, this)
      this._offsetWatched.push(actor)
      if (actor instanceof St.ScrollView) {
        actor.vadjustment.connectObject('notify::value', queue, this)
        this._offsetWatched.push(actor.vadjustment)
      }
    }
  }

  _unwatchOffsets() {
    for (const actor of this._offsetWatched ?? []) actor.disconnectObject(this)
    this._offsetWatched = null
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

    this._unwatchOffsets()

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
