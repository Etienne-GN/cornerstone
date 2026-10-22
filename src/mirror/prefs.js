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

import Adw from 'gi://Adw'
import Gio from 'gi://Gio'

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import {
  CATALOG_KEY,
  VISIBILITY_KEY,
  indicatorIsEnabled,
  setIndicatorEnabled,
} from './policy.js'

const ENABLED_KEY = 'mirror-indicators'

export class MirrorPreferences {
  constructor(page, settings, topGroup = null) {
    this._page = page
    this._settings = settings
    this._groups = []
    this._rows = []
    this._syncing = false

    this._topGroup = topGroup ?? new Adw.PreferencesGroup()
    if (!topGroup) page.add(this._topGroup)

    const enabledRow = new Adw.SwitchRow({
      title: _('Mirror status indicators'),
    })
    settings.bind(
      ENABLED_KEY,
      enabledRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )
    this._topGroup.add(enabledRow)
    this._enabledRow = enabledRow

    this._signals = [
      settings.connect(`changed::${CATALOG_KEY}`, () => this.rebuild()),
      settings.connect(`changed::${VISIBILITY_KEY}`, () => this.sync()),
    ]
    this.rebuild()
  }

  _catalog() {
    try {
      const catalog = JSON.parse(this._settings.get_string(CATALOG_KEY))
      return {
        monitors: Array.isArray(catalog?.monitors) ? catalog.monitors : [],
        roles: Array.isArray(catalog?.roles) ? catalog.roles : [],
      }
    } catch (e) {
      console.error(`[cornerstone] prefs: invalid JSON in ${CATALOG_KEY}`, e)
      return { monitors: [], roles: [] }
    }
  }

  rebuild() {
    for (const group of this._groups) this._page.remove(group)
    this._groups = []
    this._rows = []

    const { monitors, roles } = this._catalog()
    if (!monitors.length) {
      this._addGroup(
        new Adw.PreferencesGroup({
          title: _('Indicators by monitor'),
          description: _(
            'Enable the extension to configure indicators on connected monitors.',
          ),
        }),
      )
      return
    }

    let extended = 0
    for (const monitor of monitors) {
      const name = monitor.primary
        ? _('Main monitor')
        : `${_('Extended')} ${++extended}`
      const group = new Adw.PreferencesGroup({
        title: `${name} · ${monitor.width} × ${monitor.height}`,
      })

      for (const { role, label } of roles) {
        const row = new Adw.SwitchRow({ title: label })
        const entry = { row, monitor, role }
        this._syncRow(entry)
        row.connect('notify::active', () => {
          if (!this._syncing)
            setIndicatorEnabled(this._settings, monitor.key, role, row.active)
        })
        group.add(row)
        this._rows.push(entry)
      }
      this._addGroup(group)
    }
  }

  _addGroup(group) {
    this._groups.push(group)
    this._page.add(group)
  }

  _syncRow({ row, monitor, role }) {
    this._syncing = true
    try {
      row.active = indicatorIsEnabled(this._settings, monitor.key, role)
    } finally {
      this._syncing = false
    }
  }

  sync() {
    for (const entry of this._rows) this._syncRow(entry)
  }

  destroy() {
    for (const id of this._signals) this._settings.disconnect(id)
    this._signals = []
  }
}
