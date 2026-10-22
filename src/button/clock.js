/*
 * The one button's clock: GNOME's own clock text, or a custom format.
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

import Clutter from 'gi://Clutter'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import GnomeDesktop from 'gi://GnomeDesktop'
import Pango from 'gi://Pango'
import St from 'gi://St'

const FORMAT_KEY = 'clock-format'
const FONT_KEY = 'clock-font'
// strftime conversions that change every second.
const SECONDS_RE = /%[-_0^#]?[STrXcs]/

// Empty format: GNOME's clock, which follows the desktop clock settings.
export function formatClock(format, now, gnomeClock) {
  if (!format) return gnomeClock
  return now.format(format) ?? format
}

// A Pango font description as St CSS; empty for the theme font.
export function fontCss(description) {
  if (!description) return ''

  const font = Pango.FontDescription.from_string(description)
  const parts = []
  const mask = font.get_set_fields()
  if (mask & Pango.FontMask.FAMILY)
    parts.push(`font-family: "${font.get_family()}";`)
  if (mask & Pango.FontMask.SIZE) {
    const size = font.get_size() / Pango.SCALE
    parts.push(`font-size: ${size}${font.get_size_is_absolute() ? 'px' : 'pt'};`)
  }
  if (mask & Pango.FontMask.WEIGHT) parts.push(`font-weight: ${font.get_weight()};`)
  if (mask & Pango.FontMask.STYLE) {
    const style = ['normal', 'oblique', 'italic'][font.get_style()] ?? 'normal'
    parts.push(`font-style: ${style};`)
  }
  return parts.join(' ')
}

export const ClockLabel = GObject.registerClass(
  { GTypeName: 'CornerstoneClockLabel' },
  class ClockLabel extends St.Label {
    _init(settings) {
      super._init({
        style_class: 'clock cornerstone-clock',
        y_align: Clutter.ActorAlign.CENTER,
      })
      this.clutter_text.line_alignment = Pango.Alignment.CENTER
      this._settings = settings
      this._secondsId = 0

      this._wallClock = new GnomeDesktop.WallClock()
      this._wallClock.connectObject('notify::clock', () => this._sync(), this)
      settings.connectObject(
        `changed::${FORMAT_KEY}`,
        () => this._sync(),
        `changed::${FONT_KEY}`,
        () => this._syncFont(),
        this,
      )
      this.connect('destroy', () => this._onDestroy())
      this._sync()
      this._syncFont()
    }

    _sync() {
      const format = this._settings.get_string(FORMAT_KEY)
      this.text = formatClock(
        format,
        GLib.DateTime.new_now_local(),
        this._wallClock.clock,
      )
      this._scheduleSeconds(SECONDS_RE.test(format))
    }

    // WallClock ticks once a minute unless GNOME shows seconds; a custom
    // format with seconds gets its own tick.
    _scheduleSeconds(wanted) {
      if (this._secondsId) GLib.Source.remove(this._secondsId)
      this._secondsId = 0
      if (!wanted) return

      const ms = 1000 - (Math.floor(GLib.get_real_time() / 1000) % 1000)
      this._secondsId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        this._secondsId = 0
        this._sync()
        return GLib.SOURCE_REMOVE
      })
    }

    _syncFont() {
      this.style = fontCss(this._settings.get_string(FONT_KEY))
    }

    _onDestroy() {
      if (this._secondsId) GLib.Source.remove(this._secondsId)
      this._secondsId = 0
      this._wallClock.disconnectObject(this)
      this._wallClock.run_dispose()
      this._settings.disconnectObject(this)
    }
  },
)
