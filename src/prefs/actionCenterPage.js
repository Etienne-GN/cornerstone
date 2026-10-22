/*
 * The Action Center page.
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

import { _ } from './i18n.js'
import { LayoutEditor } from './layoutEditor.js'

const BANNER_KEY = 'action-center-banner-click'
const WIDTH_KEY = 'action-center-width'
const DEFAULT_WIDTH = 760

export class ActionCenterPage {
  constructor(settings) {
    this._settings = settings
    this._ids = []
    this._syncing = false

    this.page = new Adw.PreferencesPage({
      title: _('Action Center'),
      icon_name: 'view-grid-symbolic',
    })
    this._buildGeneral()
    this.layoutEditor = new LayoutEditor(settings)
    this.page.add(this.layoutEditor.mockGroup)
    this.page.add(this.layoutEditor.optionsGroup)
    this._buildSize()
  }

  _connect(key, callback) {
    this._ids.push(this._settings.connect(`changed::${key}`, callback))
  }

  _guarded(fn) {
    this._syncing = true
    try {
      fn()
    } finally {
      this._syncing = false
    }
  }

  destroy() {
    for (const id of this._ids) this._settings.disconnect(id)
    this._ids = []
    this.layoutEditor.destroy()
  }

  _reset(keys) {
    const button = new Gtk.Button({
      label: _('Reset'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    })
    button.connect('clicked', () => {
      for (const key of keys) this._settings.reset(key)
    })
    return button
  }

  _buildGeneral() {
    const group = new Adw.PreferencesGroup({
      description: _(
        'Quick settings, notifications and the calendar in one popup, opened from the button, the clock or the system menu on any monitor.',
      ),
    })
    this.enabledRow = new Adw.SwitchRow({
      title: _('Action Center'),
      subtitle: _("Off brings back GNOME's own calendar and system menu."),
    })
    this._settings.bind(
      'action-center',
      this.enabledRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )
    group.add(this.enabledRow)

    // The items follow the enum values of the banner click key.
    this.bannerRow = new Adw.ComboRow({
      title: _('Notification banner click'),
      model: Gtk.StringList.new([
        _('Open the Action Center'),
        _('Activate the notification'),
      ]),
    })
    this._settings.bind(
      'action-center',
      this.bannerRow,
      'sensitive',
      Gio.SettingsBindFlags.GET,
    )
    this.bannerRow.connect('notify::selected', () => {
      if (this._syncing) return
      if (this.bannerRow.selected !== this._settings.get_enum(BANNER_KEY))
        this._settings.set_enum(BANNER_KEY, this.bannerRow.selected)
    })
    const syncBanner = () =>
      this._guarded(() => {
        this.bannerRow.selected = this._settings.get_enum(BANNER_KEY)
      })
    this._connect(BANNER_KEY, syncBanner)
    syncBanner()
    group.add(this.bannerRow)
    this.page.add(group)
  }

  _buildSize() {
    const group = new Adw.PreferencesGroup({
      title: _('Size'),
      header_suffix: this._reset([WIDTH_KEY]),
    })

    this.autoRow = new Adw.SwitchRow({
      title: _('Fit the width to the content'),
    })
    this.widthRow = new Adw.SpinRow({
      title: _('Width'),
      subtitle: _('In pixels'),
      adjustment: new Gtk.Adjustment({
        lower: 400,
        upper: 2000,
        step_increment: 10,
        page_increment: 100,
      }),
    })
    const sync = () =>
      this._guarded(() => {
        const width = this._settings.get_int(WIDTH_KEY)
        this.autoRow.active = width === 0
        this.widthRow.sensitive = width !== 0
        if (width) this.widthRow.value = width
        else if (!this.widthRow.value) this.widthRow.value = DEFAULT_WIDTH
      })
    this.autoRow.connect('notify::active', () => {
      if (this._syncing) return
      this._settings.set_int(
        WIDTH_KEY,
        this.autoRow.active ? 0 : Math.round(this.widthRow.value),
      )
    })
    this.widthRow.connect('notify::value', () => {
      if (this._syncing || this.autoRow.active) return
      this._settings.set_int(WIDTH_KEY, Math.round(this.widthRow.value))
    })
    this._connect(WIDTH_KEY, sync)
    sync()
    group.add(this.autoRow)
    group.add(this.widthRow)

    this.page.add(group)
  }
}
