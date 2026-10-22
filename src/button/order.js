/*
 * Ordering rules for the one button, shared by the shell and the
 * preferences.
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

export const ELEMENTS = ['indicators', 'clock']

// Known elements in the user's order, each once; empty falls back to all.
export function elementOrder(saved) {
  const order = saved.filter(
    (name, index) => ELEMENTS.includes(name) && saved.indexOf(name) === index,
  )
  return order.length ? order : [...ELEMENTS]
}

// Names in `order` first, in that order; the rest keep GNOME's order.
export function orderIndicators(entries, order) {
  const rank = (name) => {
    const index = order.indexOf(name)
    return index < 0 ? order.length : index
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry.name) - rank(b.entry.name) || a.index - b.index)
    .map(({ entry }) => entry)
}
