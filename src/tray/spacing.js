/*
 * Tray icon spacing: the horizontal padding of each tray button, set
 * inline so it wins over the theme's #panel .panel-button rule.
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

export const SPACING_KEY = 'tray-icon-spacing'

// The inline style giving `px` on each side, after `original`; `original`
// alone for the theme's own padding (`px` below zero).
export function spacingStyle(original, px) {
  if (px < 0) return original
  const own = `-natural-hpadding: ${px}px; -minimum-hpadding: ${px}px;`
  const base = original?.trim().replace(/;?$/, '; ') ?? ''
  return base === '; ' ? own : `${base}${own}`
}

// Applies the spacing to buttons, extensions' included, and gives each its
// own inline style back.
export class TraySpacing {
  constructor() {
    // actor -> its inline style before any spacing
    this._originals = new Map()
  }

  apply(actor, px) {
    if (!actor) return
    if (px < 0) {
      this.restore(actor)
      return
    }
    if (!this._originals.has(actor)) {
      this._originals.set(actor, actor.get_style())
      actor.connectObject('destroy', () => this._forget(actor), this)
    }
    const style = spacingStyle(this._originals.get(actor), px)
    if (actor.get_style() !== style) this._setStyle(actor, style)
  }

  restore(actor) {
    if (!this._originals.has(actor)) return
    const original = this._originals.get(actor)
    this._forget(actor)
    this._setStyle(actor, original)
  }

  // A padding change alone leaves the geometry St compares unchanged: no
  // relayout of its own.
  _setStyle(actor, style) {
    actor.set_style(style)
    actor.queue_relayout()
  }

  _forget(actor) {
    actor.disconnectObject(this)
    this._originals.delete(actor)
  }

  restoreAll() {
    for (const actor of [...this._originals.keys()]) {
      try {
        this.restore(actor)
      } catch (e) {
        console.error('[cornerstone] tray: restoring a style failed', e)
      }
    }
  }
}
