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

export const SECTIONS = [
  ['quick-settings', () => _('Quick settings')],
  ['notifications', () => _('Notifications and media')],
  ['today', () => _('Today')],
  ['calendar', () => _('Month calendar')],
  ['events', () => _('Events')],
  ['world-clocks', () => _('World clocks')],
  ['weather', () => _('Weather')],
]
