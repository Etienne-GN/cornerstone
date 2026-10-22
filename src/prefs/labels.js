/*
 * Names people know for GNOME's quick settings indicators and the Action
 * Center sections.
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

import { _ } from './i18n.js'

const INDICATORS = {
  network: () => _('Network'),
  bluetooth: () => _('Bluetooth'),
  system: () => _('Battery and power'),
  camera: () => _('Camera in use'),
  volumeOutput: () => _('Volume'),
  volumeInput: () => _('Microphone'),
  brightness: () => _('Brightness'),
  remoteAccess: () => _('Remote access'),
  location: () => _('Location in use'),
  thunderbolt: () => _('Thunderbolt'),
  nightLight: () => _('Night Light'),
  darkMode: () => _('Dark Style'),
  doNotDisturb: () => _('Do Not Disturb'),
  backlight: () => _('Keyboard backlight'),
  powerProfiles: () => _('Power mode'),
  rfkill: () => _('Airplane mode'),
  autoRotate: () => _('Auto rotate'),
  unsafeMode: () => _('Unsafe mode'),
}

export function indicatorLabel(name) {
  if (INDICATORS[name]) return INDICATORS[name]()
  const extension = /^extension:(.+?)(#\d+)?$/.exec(name)
  return extension ? `${extension[1]}${extension[2] ?? ''}` : name
}

// Per Action Center block: its name, icon and, for the blocks GNOME only
// shows when there is something in them, when that is.
export const BLOCK_LABELS = {
  'quick-settings': [() => _('Quick settings'), 'emblem-system-symbolic'],
  notifications: [
    () => _('Notifications and media'),
    'preferences-system-notifications-symbolic',
  ],
  today: [() => _('Today'), 'daytime-sunrise-symbolic'],
  calendar: [() => _('Month calendar'), 'x-office-calendar-symbolic'],
  events: [
    () => _('Events'),
    'appointment-soon-symbolic',
    () => _('Shown when a calendar account is set up.'),
  ],
  'world-clocks': [
    () => _('World clocks'),
    'preferences-system-time-symbolic',
    () => _('Shown when GNOME Clocks is installed.'),
  ],
  weather: [
    () => _('Weather'),
    'weather-few-clouds-symbolic',
    () => _('Shown when GNOME Weather is installed.'),
  ],
}

// In the order of the values in actionCenter/layout.js.
export const BLOCK_ALIGNS = [
  ['fill', () => _('Stretched')],
  ['start', () => _('Docked left')],
  ['center', () => _('Centered')],
  ['end', () => _('Docked right')],
]
export const COLUMN_WIDTHS = [
  ['fill', () => _('Share the free width')],
  ['fit', () => _('Fit the content')],
]
export const COLUMN_VALIGNS = [
  ['start', () => _('Top')],
  ['center', () => _('Centered')],
  ['end', () => _('Bottom')],
  ['fill', () => _('Stretched')],
]
export const ROW_ALIGNS = [
  ['center', () => _('Centered')],
  ['start', () => _('Docked left')],
  ['end', () => _('Docked right')],
]
