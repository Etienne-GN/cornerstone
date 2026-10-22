/*
 * The Button page: what the one button shows and how its clock looks.
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
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'
import Pango from 'gi://Pango'

import { ButtonConfig } from '../button/config.js'
import { ELEMENTS, elementOrder, orderIndicators } from '../button/order.js'
import { BUTTON_KEYS, OVERRIDES_KEY, parseOverrides } from '../button/overrides.js'
import { CATALOG_KEY, readCatalog } from './catalog.js'
import { _ } from './i18n.js'
import { indicatorLabel } from './labels.js'
import { monitorNames, monitorTitle } from './monitors.js'
import { ButtonPreview } from './preview.js'
import {
  RowSet,
  dropOrder,
  makeReorderable,
  stepOrder,
} from './reorder.js'

// Formats offered as examples of now; '' follows GNOME's clock settings.
export const CLOCK_PRESETS = [
  '',
  '%H:%M',
  '%-l:%M %p',
  '%a %H:%M',
  '%a %-d %b %H:%M',
  '%H:%M\n%x',
]

const FORMAT_CODES = [
  ['%H', () => _('Hour, 00–23')],
  ['%-l', () => _('Hour, 1–12')],
  ['%M', () => _('Minutes')],
  ['%S', () => _('Seconds')],
  ['%p', () => _('AM or PM')],
  ['%a', () => _('Weekday, short')],
  ['%A', () => _('Weekday')],
  ['%-d', () => _('Day of the month')],
  ['%b', () => _('Month, short')],
  ['%B', () => _('Month')],
  ['%m', () => _('Month number')],
  ['%Y', () => _('Year')],
  ['%V', () => _('Week number')],
  ['%x', () => _('Date, as your language writes it')],
  ['\\n', () => _('Second line')],
]

const INDICATOR_STATE_LABELS = () => [
  _('Shown'),
  _('In the overflow'),
  _('Hidden'),
]

const ELEMENT_LABELS = {
  indicators: () => _('System indicators'),
  clock: () => _('Clock'),
}

function resetButton(config, keys) {
  const button = new Gtk.Button({
    label: _('Reset'),
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
    tooltip_text: _("Back to GNOME's look"),
  })
  button.connect('clicked', () => {
    for (const key of keys) config.reset(key)
  })
  return button
}

function iconImage(icon) {
  const image = new Gtk.Image({ pixel_size: 16 })
  try {
    if (icon) image.gicon = Gio.icon_new_for_string(icon)
    else image.icon_name = 'image-missing-symbolic'
  } catch {
    image.icon_name = 'image-missing-symbolic'
  }
  return image
}

// Shows "\n" as typed in the format entry, and back.
export const escapeFormat = (format) => format.replaceAll('\n', '\\n')
export const unescapeFormat = (text) => text.replaceAll('\\n', '\n')

export class ButtonPage {
  constructor(settings) {
    this._settings = settings
    // What the groups below show and change: every monitor's settings, or
    // one monitor's.
    this._config = new ButtonConfig(settings)
    this._ids = []
    this._configIds = []
    this._names = {}
    this._monitorChoices = [null]
    this._monitorLabels = ''
    this._destroyed = false
    this._syncing = false

    this.page = new Adw.PreferencesPage({
      title: _('Button'),
      icon_name: 'preferences-system-time-symbolic',
    })

    this._buildTop()
    this._buildMonitors()
    this._buildElements()
    this._buildIndicators()
    this._buildClock()
    this._buildMore()
    this._syncMonitors()
  }

  // Button settings come through the config, which follows the monitor
  // chosen; the others straight from the settings.
  _connect(key, callback) {
    if (key in BUTTON_KEYS)
      this._configIds.push(this._config.connect(`changed::${key}`, callback))
    else this._ids.push(this._settings.connect(`changed::${key}`, callback))
  }

  destroy() {
    this._destroyed = true
    for (const id of this._ids) this._settings.disconnect(id)
    this._ids = []
    for (const id of this._configIds) this._config.disconnect(id)
    this._configIds = []
    this._preview.destroy()
    this._config.destroy()
  }

  // The monitor the page edits: a monitor key, or null for every monitor.
  get monitor() {
    return this._config.monitor
  }

  selectMonitor(monitor) {
    this._config.setMonitor(monitor)
    this._syncMonitors()
  }

  _buildMonitors() {
    const group = new Adw.PreferencesGroup({
      title: _('Monitors'),
      description: _(
        'Give a monitor its own button: choose it, then turn on its own settings.',
      ),
    })
    this.monitorRow = new Adw.ComboRow({ title: _('Settings for') })
    this.monitorRow.connect('notify::selected', () => {
      if (this._syncing) return
      this.selectMonitor(this._monitorChoices[this.monitorRow.selected] ?? null)
    })
    group.add(this.monitorRow)

    this.ownRow = new Adw.SwitchRow({
      title: _('Own settings for this monitor'),
      subtitle: _('Off, it looks like every other monitor.'),
    })
    this.ownRow.connect('notify::active', () => {
      if (this._syncing) return
      this._config.setOverride(this.ownRow.active)
    })
    group.add(this.ownRow)
    this.page.add(group)
    this._monitorGroup = group

    for (const key of [CATALOG_KEY, OVERRIDES_KEY])
      this._ids.push(
        this._settings.connect(`changed::${key}`, () => this._syncMonitors()),
      )
    monitorNames().then((names) => {
      if (this._destroyed) return
      this._names = names
      this._syncMonitors()
    })
  }

  _syncMonitors() {
    const { monitors } = readCatalog(this._settings)
    const overrides = parseOverrides(this._settings.get_string(OVERRIDES_KEY))
    let monitor = this._config.monitor
    // A monitor unplugged while chosen: back to every monitor.
    if (monitor !== null && !monitors.some((m) => m.key === monitor)) {
      monitor = null
      this._config.setMonitor(null)
    }

    let extended = 0
    const titles = monitors.map((m) => {
      const title = monitorTitle(m, this._names, m.primary ? 0 : extended++)
      return overrides[m.key] ? `${title} · ${_('own settings')}` : title
    })
    this._monitorChoices = [null, ...monitors.map((m) => m.key)]

    const own = this._config.hasOverride
    this._syncing = true
    try {
      // Replacing the model from its own notify::selected never returns.
      const labels = [_('Every monitor'), ...titles]
      if (labels.join('\n') !== this._monitorLabels) {
        this._monitorLabels = labels.join('\n')
        this.monitorRow.model = Gtk.StringList.new(labels)
      }
      this.monitorRow.selected = Math.max(
        0,
        this._monitorChoices.indexOf(monitor),
      )
      this.ownRow.active = own
    } finally {
      this._syncing = false
    }
    this._monitorGroup.visible = monitors.length > 1
    this.ownRow.visible = monitor !== null

    // A monitor without its own settings shows every monitor's, read-only.
    const editable = monitor === null || own
    for (const group of [
      this._elementGroup,
      this._indicatorGroup,
      this._clockGroup,
      this._moreGroup,
    ])
      group.sensitive = editable
  }

  _buildTop() {
    const previewGroup = new Adw.PreferencesGroup()
    this._preview = new ButtonPreview(this._settings, this._config)
    previewGroup.add(this._preview)
    this.page.add(previewGroup)

    const group = new Adw.PreferencesGroup({
      description: _(
        'One button replaces the clock and the system menu on every bar, and opens the Action Center.',
      ),
    })

    const enabled = new Adw.SwitchRow({
      title: _('One button'),
      subtitle: _("Off brings back GNOME's clock and system menu."),
    })
    this._settings.bind(
      'one-button',
      enabled,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )
    group.add(enabled)
    this.page.add(group)
  }

  _buildElements() {
    const group = new Adw.PreferencesGroup({
      title: _('Elements'),
      description: _('What the button shows, in order.'),
      header_suffix: resetButton(this._config, ['button-elements']),
    })
    this.page.add(group)
    this._elementGroup = group
    this._elementRows = new RowSet(group)
    this._connect('button-elements', () => this._syncElements())
    this._syncElements()
  }

  _syncElements() {
    this._elementRows.clear()
    const shown = elementOrder(this._config.get_strv('button-elements'))
    const all = [...shown, ...ELEMENTS.filter((e) => !shown.includes(e))]
    const write = (order, visible) =>
      this._config.set_strv(
        'button-elements',
        order.filter((name) => visible.includes(name)),
      )

    all.forEach((name, index) => {
      const row = new Adw.SwitchRow({
        title: ELEMENT_LABELS[name](),
        active: shown.includes(name),
      })
      // The button always shows something.
      row.sensitive = !(shown.length === 1 && shown[0] === name)
      row.connect('notify::active', () => {
        const visible = row.active
          ? [...shown, name]
          : shown.filter((n) => n !== name)
        write(all, visible)
      })
      makeReorderable(row, name, {
        first: index === 0,
        last: index === all.length - 1,
        move: (key, delta) => write(stepOrder(all, key, delta), shown),
        dropOn: (dragged, target) =>
          write(dropOrder(all, dragged, target), shown),
      })
      this._elementRows.add(row)
    })
  }

  _buildIndicators() {
    const group = new Adw.PreferencesGroup({
      title: _('System indicators'),
      description: _(
        'Shown in the button, or in the tray overflow, when GNOME shows them.',
      ),
      header_suffix: resetButton(this._config, [
        'button-indicator-order',
        'button-hidden-indicators',
        'button-overflow-indicators',
      ]),
    })
    this.page.add(group)
    this._indicatorRows = new RowSet(group)
    this._indicatorGroup = group
    for (const key of [
      CATALOG_KEY,
      'button-indicator-order',
      'button-hidden-indicators',
      'button-overflow-indicators',
    ])
      this._connect(key, () => this._syncIndicators())
    this._syncIndicators()
  }

  _syncIndicators() {
    this._indicatorRows.clear()
    const { indicators } = readCatalog(this._settings)
    if (!indicators.length) {
      this._indicatorRows.add(
        new Adw.ActionRow({
          title: _('Enable Cornerstone to list the indicators.'),
          css_classes: ['dim-label'],
        }),
      )
      return
    }

    const hidden = this._config.get_strv('button-hidden-indicators')
    const overflow = this._config.get_strv('button-overflow-indicators')
    const ordered = orderIndicators(
      indicators,
      this._config.get_strv('button-indicator-order'),
    )
    const names = ordered.map((i) => i.name)
    const writeOrder = (order) =>
      this._config.set_strv('button-indicator-order', order)

    ordered.forEach(({ name, icon, visible }, index) => {
      const row = new Adw.ActionRow({
        title: indicatorLabel(name),
        subtitle: visible === false ? _('Not shown by GNOME right now') : '',
      })
      row.add_prefix(iconImage(icon))
      const placement = new Gtk.DropDown({
        model: Gtk.StringList.new(INDICATOR_STATE_LABELS()),
        selected: hidden.includes(name) ? 2 : overflow.includes(name) ? 1 : 0,
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Where the indicator goes'),
      })
      placement.connect('notify::selected', () => {
        const without = (list) => list.filter((n) => n !== name)
        const selected = placement.selected
        this._config.set_strv('button-overflow-indicators', [
          ...without(overflow),
          ...(selected === 1 ? [name] : []),
        ])
        this._config.set_strv('button-hidden-indicators', [
          ...without(hidden),
          ...(selected === 2 ? [name] : []),
        ])
      })
      row.add_suffix(placement)
      row._placement = placement
      makeReorderable(row, name, {
        first: index === 0,
        last: index === names.length - 1,
        move: (key, delta) => writeOrder(stepOrder(names, key, delta)),
        dropOn: (dragged, target) =>
          writeOrder(dropOrder(names, dragged, target)),
      })
      this._indicatorRows.add(row)
    })
  }

  _buildClock() {
    const group = new Adw.PreferencesGroup({
      title: _('Clock'),
      header_suffix: resetButton(this._config, ['clock-format', 'clock-font']),
    })
    this.page.add(group)
    this._clockGroup = group

    const now = GLib.DateTime.new_now_local()
    const labels = CLOCK_PRESETS.map((format) =>
      format
        ? (now.format(format) ?? format).replaceAll('\n', ' / ')
        : _('As GNOME shows it'),
    )
    labels.push(_('Custom'))
    this._formatRow = new Adw.ComboRow({
      title: _('Format'),
      model: Gtk.StringList.new(labels),
    })
    group.add(this._formatRow)

    this._formatRow.connect('notify::selected', () => {
      if (this._syncing) return
      const index = this._formatRow.selected
      if (index < CLOCK_PRESETS.length)
        this._config.set_string('clock-format', CLOCK_PRESETS[index])
      // Custom: write it under More options, starting from the format now.
      else this._customRow.grab_focus()
    })

    const fontButton = new Gtk.FontDialogButton({
      dialog: new Gtk.FontDialog(),
      use_font: true,
      valign: Gtk.Align.CENTER,
    })
    this._fontRow = new Adw.ActionRow({ title: _('Font') })
    this._fontRow.add_suffix(fontButton)
    group.add(this._fontRow)
    this._fontButton = fontButton
    fontButton.connect('notify::font-desc', () => {
      if (this._syncing) return
      const desc = fontButton.font_desc
      this._config.set_string('clock-font', desc ? desc.to_string() : '')
    })
    this._connect('clock-font', () => this._syncFont())
    this._syncFont()
  }

  // Less common settings: your own clock format and the button's spacing.
  _buildMore() {
    const group = new Adw.PreferencesGroup({
      title: _('More options'),
      header_suffix: resetButton(this._config, ['button-spacing']),
    })
    this.page.add(group)
    this._moreGroup = group

    this._customRow = new Adw.EntryRow({
      title: _('Clock format'),
      show_apply_button: true,
    })
    this._customRow.connect('apply', () =>
      this._config.set_string(
        'clock-format',
        unescapeFormat(this._customRow.text),
      ),
    )
    group.add(this._customRow)

    const codes = new Adw.ExpanderRow({
      title: _('Format codes'),
      subtitle: _('Click a code to add it to the clock format.'),
    })
    for (const [code, label] of FORMAT_CODES) {
      const row = new Adw.ActionRow({
        title: label(),
        activatable: true,
      })
      row.add_prefix(
        new Gtk.Label({
          label: code,
          width_chars: 4,
          xalign: 0,
          css_classes: ['monospace'],
        }),
      )
      row.connect('activated', () => {
        this._customRow.text += code
        this._customRow.grab_focus()
      })
      codes.add_row(row)
    }
    group.add(codes)
    this._codesRow = codes
    this._connect('clock-format', () => this._syncFormat())
    this._syncFormat()

    this.spacingRow = Adw.SpinRow.new_with_range(0, 32, 1)
    this.spacingRow.title = _('Spacing')
    this.spacingRow.subtitle = _(
      'Pixels between the system indicators and the clock.',
    )
    this.spacingRow.connect('notify::value', () => {
      if (this._syncing) return
      this._config.set_int('button-spacing', this.spacingRow.value)
    })
    group.add(this.spacingRow)
    this._connect('button-spacing', () => this._syncSpacing())
    this._syncSpacing()
  }

  _syncSpacing() {
    this._syncing = true
    try {
      this.spacingRow.value = this._config.get_int('button-spacing')
    } finally {
      this._syncing = false
    }
  }

  _syncFormat() {
    const format = this._config.get_string('clock-format')
    const preset = CLOCK_PRESETS.indexOf(format)
    this._syncing = true
    try {
      this._formatRow.selected = preset < 0 ? CLOCK_PRESETS.length : preset
      // Empty follows GNOME: the field's title says what to type.
      this._customRow.text = escapeFormat(format)
    } finally {
      this._syncing = false
    }
  }

  _syncFont() {
    const font = this._config.get_string('clock-font')
    this._syncing = true
    try {
      this._fontButton.font_desc = Pango.FontDescription.from_string(
        font || 'Sans Bold 11',
      )
      this._fontRow.subtitle = font ? '' : _('Theme font')
    } finally {
      this._syncing = false
    }
  }
}
