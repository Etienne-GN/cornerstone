/*
 * Monitor names as GNOME Settings shows them, from Mutter's display
 * configuration.
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

import Gio from 'gi://Gio'
import GLib from 'gi://GLib'

import { _ } from './i18n.js'

// connector -> display name ("Dell Inc. 27\""), or {} when Mutter cannot
// be asked.
export function monitorNames() {
  return new Promise((resolve) => {
    Gio.DBus.session.call(
      'org.gnome.Mutter.DisplayConfig',
      '/org/gnome/Mutter/DisplayConfig',
      'org.gnome.Mutter.DisplayConfig',
      'GetCurrentState',
      null,
      new GLib.VariantType('(ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv})'),
      Gio.DBusCallFlags.NONE,
      2000,
      null,
      (connection, result) => {
        const names = {}
        try {
          const [, monitors] = connection.call_finish(result).deepUnpack()
          for (const [[connector, vendor, product], , props] of monitors) {
            const display = props['display-name']?.deepUnpack()
            names[connector] = display || [vendor, product].join(' ').trim()
          }
        } catch (e) {
          console.error('[cornerstone] prefs: monitor names', e)
        }
        resolve(names)
      },
    )
  })
}

// "Main monitor · Dell Inc. 27\" (DP-1) · 2560 × 1440"
export function monitorTitle(monitor, names, extendedIndex) {
  const role = monitor.primary
    ? _('Main monitor')
    : `${_('Monitor')} ${extendedIndex + 1}`
  const name = names[monitor.connector]
  const what = name
    ? `${name} (${monitor.connector})`
    : monitor.connector || ''
  const size = `${monitor.width} × ${monitor.height}`
  return [role, what, size].filter(Boolean).join(' · ')
}
