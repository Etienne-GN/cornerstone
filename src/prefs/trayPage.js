/*
 * The Tray page: per monitor, the order of the tray icons, their box,
 * and whether each is shown, in the overflow or hidden.
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

import Adw from 'gi://Adw'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'

import {
  BOXES,
  OVERFLOW_ROLE,
  STATES,
  TRAY_KEY,
  copyTrayItems,
  mergeTrayItems,
  planTray,
  readTrayLayout,
  resetTrayItems,
  writeTrayItems,
} from '../tray/layout.js'
import { VISIBILITY_KEY, indicatorIsEnabled } from '../mirror/policy.js'
import { SPACING_KEY } from '../tray/spacing.js'
import { CATALOG_KEY, readCatalog } from './catalog.js'
import { _ } from './i18n.js'
import { monitorNames, monitorTitle } from './monitors.js'
import { RowSet, dropOrder, makeReorderable, stepOrder } from './reorder.js'

const STATE_LABELS = () => [_('Shown'), _('In the overflow'), _('Hidden')]
const BOX_LABELS = () => [_('Left'), _('Centre'), _('Right')]

function iconImage(icon) {
  const image = new Gtk.Image({ pixel_size: 16 })
  try {
    if (icon) image.gicon = Gio.icon_new_for_string(icon)
    else image.icon_name = 'application-x-addon-symbolic'
  } catch {
    image.icon_name = 'application-x-addon-symbolic'
  }
  return image
}

// "Vitals (Vitals@CoreCoding.com)" -> "Vitals"
function shortLabel(label, role) {
  return label?.replace(` (${role})`, '') || role
}

export class TrayPage {
  constructor(settings) {
    this._settings = settings
    this._ids = []
    this._names = {}
    this._monitorKey = 'main'
    this._syncing = false

    this.page = new Adw.PreferencesPage({
      title: _('Tray'),
      icon_name: 'video-display-symbolic',
    })

    const top = new Adw.PreferencesGroup({
      description: _(
        'Order the tray icons of each monitor, and put the ones you rarely need in the overflow, behind a chevron.',
      ),
    })
    this.mirrorRow = new Adw.SwitchRow({
      title: _('Tray icons on every monitor'),
      subtitle: _(
        'With Dash to Panel on several monitors, the other bars show the tray icons too.',
      ),
    })
    settings.bind(
      'mirror-indicators',
      this.mirrorRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )
    top.add(this.mirrorRow)
    this.columnsRow = Adw.SpinRow.new_with_range(1, 8, 1)
    this.columnsRow.title = _('Overflow columns')
    this.columnsRow.subtitle = _('Icons per row in the overflow popup.')
    settings.bind(
      'tray-overflow-columns',
      this.columnsRow,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    )
    top.add(this.columnsRow)
    this.spacingRow = new Adw.ExpanderRow({
      title: _('Custom icon spacing'),
      subtitle: _(
        "Space on each side of a tray icon on horizontal bars; off keeps the theme's.",
      ),
      show_enable_switch: true,
    })
    this.spacingValueRow = Adw.SpinRow.new_with_range(0, 16, 1)
    this.spacingValueRow.title = _('Pixels')
    this.spacingValueRow.value = 4
    this.spacingRow.add_row(this.spacingValueRow)
    this.spacingRow.connect('notify::enable-expansion', () =>
      this._writeSpacing(),
    )
    this.spacingValueRow.connect('notify::value', () => this._writeSpacing())
    this._ids.push(
      settings.connect(`changed::${SPACING_KEY}`, () => this._syncSpacing()),
    )
    this._syncSpacing()
    top.add(this.spacingRow)
    this.monitorRow = new Adw.ComboRow({ title: _('Monitor') })
    this.monitorRow.connect('notify::selected', () => {
      if (this._syncing) return
      this._monitorKey =
        this._monitors[this.monitorRow.selected]?.key ?? 'main'
      this._syncCopyTargets()
      this._syncIcons()
    })
    top.add(this.monitorRow)
    this.page.add(top)

    const reset = new Gtk.Button({
      label: _('Reset'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
      tooltip_text: _("This monitor's icons back to GNOME's order"),
    })
    reset.connect('clicked', () => resetTrayItems(settings, this._monitorKey))
    this._copyPopover = new Gtk.Popover()
    this.copyButton = new Gtk.MenuButton({
      label: _('Copy to…'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
      tooltip_text: _("This monitor's layout onto another monitor"),
      popover: this._copyPopover,
    })
    const actions = new Gtk.Box({ spacing: 6 })
    actions.append(this.copyButton)
    actions.append(reset)
    this._iconGroup = new Adw.PreferencesGroup({
      title: _('Icons'),
      header_suffix: actions,
    })
    this._iconRows = new RowSet(this._iconGroup)
    this.page.add(this._iconGroup)

    for (const key of [CATALOG_KEY, TRAY_KEY, VISIBILITY_KEY])
      this._ids.push(
        settings.connect(`changed::${key}`, () => this._syncAll()),
      )
    this._syncAll()
    monitorNames().then((names) => {
      this._names = names
      this._syncMonitors()
    })
  }

  _syncSpacing() {
    const px = this._settings.get_int(SPACING_KEY)
    this._syncing = true
    try {
      this.spacingRow.enable_expansion = px >= 0
      if (px >= 0) this.spacingValueRow.value = px
    } finally {
      this._syncing = false
    }
  }

  _writeSpacing() {
    if (this._syncing) return
    const px = this.spacingRow.enable_expansion
      ? this.spacingValueRow.value
      : -1
    if (this._settings.get_int(SPACING_KEY) !== px)
      this._settings.set_int(SPACING_KEY, px)
  }

  destroy() {
    for (const id of this._ids) this._settings.disconnect(id)
    this._ids = []
  }

  _syncAll() {
    this._syncMonitors()
    this._syncIcons()
  }

  _syncMonitors() {
    const { monitors } = readCatalog(this._settings)
    this._monitors = monitors
    let extended = 0
    const titles = monitors.map((m) =>
      monitorTitle(m, this._names, m.primary ? 0 : extended++),
    )
    this._titles = titles
    this._syncing = true
    try {
      this.monitorRow.model = Gtk.StringList.new(titles)
      const index = monitors.findIndex((m) => m.key === this._monitorKey)
      this.monitorRow.selected = Math.max(index, 0)
      this._monitorKey = monitors[Math.max(index, 0)]?.key ?? 'main'
    } finally {
      this._syncing = false
    }
    this.monitorRow.visible = monitors.length > 1
    this._syncCopyTargets()
  }

  // The monitors the selected one's layout can be copied to.
  _syncCopyTargets() {
    const others = this._monitors
      .map((m, i) => ({ key: m.key, title: this._titles[i] }))
      .filter(({ key }) => key !== this._monitorKey)
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    const add = (title, keys) => {
      const button = new Gtk.Button({
        child: new Gtk.Label({ label: title, xalign: 0 }),
        css_classes: ['flat'],
      })
      button.connect('clicked', () => {
        this._copyPopover.popdown()
        this.copyTo(keys)
      })
      box.append(button)
    }
    for (const { key, title } of others) add(title, [key])
    if (others.length > 1)
      add(_('All other monitors'), others.map(({ key }) => key))
    this._copyPopover.child = box
    this.copyButton.visible = others.length > 0
  }

  // Gives the monitors `keys` the selected monitor's layout, as shown.
  copyTo(keys) {
    copyTrayItems(this._settings, this._monitorKey, keys, this.items())
  }

  // The icons of the selected monitor, as the shell would place them.
  items() {
    const { tray } = readCatalog(this._settings)
    const key = this._monitorKey
    const saved = readTrayLayout(this._settings)[key]
    return planTray(tray, saved, (role) =>
      indicatorIsEnabled(this._settings, key, role) ? 'shown' : 'hidden',
    )
  }

  _write(items) {
    const key = this._monitorKey
    const saved = readTrayLayout(this._settings)[key]
    writeTrayItems(this._settings, key, mergeTrayItems(saved, items))
  }

  _syncIcons() {
    this._iconRows.clear()
    const { roles } = readCatalog(this._settings)
    const labels = new Map(roles.map((r) => [r.role, r]))
    const items = this.items()
    if (!items.some((item) => item.role !== OVERFLOW_ROLE)) {
      this._iconRows.add(
        new Adw.ActionRow({
          title: _('No tray icons'),
          subtitle: _(
            'Icons from extensions such as AppIndicator or Vitals show up here while Cornerstone is enabled.',
          ),
          css_classes: ['dim-label'],
        }),
      )
      return
    }

    const order = items.map((i) => i.role)
    const reorder = (keys) =>
      this._write(keys.map((role) => items.find((i) => i.role === role)))

    items.forEach((item, index) => {
      const overflow = item.role === OVERFLOW_ROLE
      const info = labels.get(item.role)
      const title = overflow
        ? _('Overflow')
        : shortLabel(info?.label, item.role)
      const row = new Adw.ActionRow({
        title,
        subtitle: overflow
          ? _('The chevron, while icons are in the overflow')
          : title === item.role
            ? ''
            : item.role,
      })
      row.add_prefix(
        overflow
          ? new Gtk.Image({ icon_name: 'pan-down-symbolic', pixel_size: 16 })
          : iconImage(info?.icon),
      )

      const state = new Gtk.DropDown({
        model: Gtk.StringList.new(STATE_LABELS()),
        selected: STATES.indexOf(item.state),
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Where the icon goes'),
      })
      state.connect('notify::selected', () =>
        this._write(
          items.map((i) =>
            i === item ? { ...i, state: STATES[state.selected] } : i,
          ),
        ),
      )
      const box = new Gtk.DropDown({
        model: Gtk.StringList.new(BOX_LABELS()),
        selected: BOXES.indexOf(item.box),
        valign: Gtk.Align.CENTER,
        sensitive: item.state === 'shown',
        tooltip_text: _('Part of the bar'),
      })
      box.connect('notify::selected', () =>
        this._write(
          items.map((i) =>
            i === item ? { ...i, box: BOXES[box.selected] } : i,
          ),
        ),
      )
      row.add_suffix(box)
      if (!overflow) row.add_suffix(state)
      makeReorderable(row, item.role, {
        first: index === 0,
        last: index === items.length - 1,
        move: (key, delta) => reorder(stepOrder(order, key, delta)),
        dropOn: (dragged, target) =>
          reorder(dropOrder(order, dragged, target)),
      })
      this._iconRows.add(row)
    })
  }
}
