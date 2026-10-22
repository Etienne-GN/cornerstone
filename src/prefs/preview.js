/*
 * A live preview of the one button, drawn with GTK from the settings and
 * what the shell publishes.
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
import GObject from 'gi://GObject'
import Gtk from 'gi://Gtk'
import Pango from 'gi://Pango'

import { elementOrder, orderIndicators } from '../button/order.js'
import { readCatalog, CATALOG_KEY } from './catalog.js'

const CSS = `
.cornerstone-preview-bar {
  background-color: #000000;
  color: #ffffff;
  border-radius: 14px;
  padding: 8px 18px;
}
.cornerstone-preview-button {
  background-color: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 4px 12px;
}
.cornerstone-preview-clock {
  font-weight: bold;
}
`

let cssLoaded = false
function loadCss(widget) {
  if (cssLoaded) return
  cssLoaded = true
  const provider = new Gtk.CssProvider()
  provider.load_from_string(CSS)
  Gtk.StyleContext.add_provider_for_display(
    widget.get_display(),
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
  )
}

// GNOME's clock as WallClock writes it, from the desktop clock settings.
export function gnomeClockFormat(desktop) {
  const twelve = desktop.get_string('clock-format') === '12h'
  const seconds = desktop.get_boolean('clock-show-seconds')
  const time = twelve
    ? seconds
      ? '%-l:%M:%S %p'
      : '%-l:%M %p'
    : seconds
      ? '%H:%M:%S'
      : '%H:%M'
  const parts = []
  if (desktop.get_boolean('clock-show-weekday')) parts.push('%a')
  if (desktop.get_boolean('clock-show-date')) parts.push('%b %-d')
  parts.push(time)
  return parts.join(' ')
}

export const ButtonPreview = GObject.registerClass(
  { GTypeName: 'CornerstoneButtonPreview' },
  class ButtonPreview extends Gtk.Box {
    _init(settings) {
      super._init({
        halign: Gtk.Align.CENTER,
        css_classes: ['cornerstone-preview-bar'],
      })
      this._settings = settings
      this._desktop = new Gio.Settings({
        schema_id: 'org.gnome.desktop.interface',
      })
      this._button = new Gtk.Box({
        spacing: 8,
        css_classes: ['cornerstone-preview-button'],
      })
      this.append(this._button)
      this._indicators = new Gtk.Box({ spacing: 8 })
      this._clock = new Gtk.Label({
        css_classes: ['cornerstone-preview-clock'],
        justify: Gtk.Justification.CENTER,
      })
      this.connect('realize', () => loadCss(this))

      this._ids = [
        CATALOG_KEY,
        'button-elements',
        'button-indicator-order',
        'button-hidden-indicators',
      ].map((key) =>
        settings.connect(`changed::${key}`, () => this._syncLayout()),
      )
      this._ids.push(
        settings.connect('changed::clock-format', () => this._syncClock()),
        settings.connect('changed::clock-font', () => this._syncClock()),
      )
      this._desktopId = this._desktop.connect('changed', () =>
        this._syncClock(),
      )
      this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this._syncClock()
        return GLib.SOURCE_CONTINUE
      })
      this._syncLayout()
      this._syncClock()
    }

    // Called when the preferences window closes.
    destroy() {
      if (this._tick) GLib.Source.remove(this._tick)
      this._tick = 0
      for (const id of this._ids) this._settings.disconnect(id)
      this._ids = []
      if (this._desktopId) this._desktop.disconnect(this._desktopId)
      this._desktopId = 0
    }

    // The clock text the button would show now.
    get clockText() {
      return this._clock.label
    }

    _syncLayout() {
      for (const child of [this._indicators, this._clock])
        if (child.get_parent()) this._button.remove(child)
      const elements = {
        indicators: this._indicators,
        clock: this._clock,
      }
      for (const name of elementOrder(
        this._settings.get_strv('button-elements'),
      ))
        this._button.append(elements[name])

      let child
      while ((child = this._indicators.get_first_child()))
        this._indicators.remove(child)
      const hidden = new Set(this._settings.get_strv('button-hidden-indicators'))
      const order = this._settings.get_strv('button-indicator-order')
      const { indicators } = readCatalog(this._settings)
      for (const { name, icon, visible } of orderIndicators(indicators, order)) {
        if (hidden.has(name) || !icon || visible === false) continue
        const image = new Gtk.Image({ pixel_size: 16 })
        try {
          image.gicon = Gio.icon_new_for_string(icon)
        } catch {
          image.icon_name = 'image-missing-symbolic'
        }
        this._indicators.append(image)
      }
    }

    _syncClock() {
      const custom = this._settings.get_string('clock-format')
      const format = custom || gnomeClockFormat(this._desktop)
      const now = GLib.DateTime.new_now_local()
      this._clock.label = now.format(format) ?? format

      const font = this._settings.get_string('clock-font')
      const attrs = new Pango.AttrList()
      if (font)
        attrs.insert(
          Pango.attr_font_desc_new(Pango.FontDescription.from_string(font)),
        )
      this._clock.attributes = attrs
    }
  },
)
