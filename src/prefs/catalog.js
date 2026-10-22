/*
 * What the shell publishes for the preferences: monitors, tray icons and
 * the one button's indicators.
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

export const CATALOG_KEY = 'mirror-indicator-catalog'

const list = (value) => (Array.isArray(value) ? value : [])

export function readCatalog(settings) {
  try {
    const catalog = JSON.parse(settings.get_string(CATALOG_KEY))
    return {
      monitors: list(catalog?.monitors),
      roles: list(catalog?.roles),
      tray: list(catalog?.tray),
      indicators: list(catalog?.indicators),
    }
  } catch (e) {
    console.error(`[cornerstone] prefs: invalid JSON in ${CATALOG_KEY}`, e)
    return { monitors: [], roles: [], tray: [], indicators: [] }
  }
}
