/*
 * The one button's settings as one monitor sees them: its own values where
 * it overrides them, every monitor's otherwise. Reads like Gio.Settings for
 * the keys in BUTTON_KEYS, so the button and the preferences use it in its
 * place.
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

import GObject from 'gi://GObject'

import {
  BUTTON_KEYS,
  OVERRIDES_KEY,
  overriddenValue,
  parseOverrides,
  withOverride,
  withOverrideValue,
} from './overrides.js'

export const ButtonConfig = GObject.registerClass(
  {
    GTypeName: 'CornerstoneButtonConfig',
    Signals: {
      changed: {
        flags: GObject.SignalFlags.RUN_LAST | GObject.SignalFlags.DETAILED,
        param_types: [GObject.TYPE_STRING],
      },
    },
  },
  class ButtonConfig extends GObject.Object {
    // `monitor` is a monitor key ('main', 'connector:DP-1'), or null for
    // the settings every monitor follows.
    _init(settings, monitor = null) {
      super._init()
      this._settings = settings
      this._monitor = monitor
      this._ids = [
        settings.connect(`changed::${OVERRIDES_KEY}`, () => this._emitAll()),
        ...Object.keys(BUTTON_KEYS).map((key) =>
          settings.connect(`changed::${key}`, () => this._globalChanged(key)),
        ),
      ]
    }

    get monitor() {
      return this._monitor
    }

    setMonitor(monitor) {
      if (this._monitor === monitor) return
      this._monitor = monitor
      this._emitAll()
    }

    // Whether this monitor has its own settings.
    get hasOverride() {
      return (
        this._monitor !== null &&
        this._overrides()[this._monitor] !== undefined
      )
    }

    // On: the monitor starts from every monitor's current values. Off: it
    // follows them again.
    setOverride(on) {
      if (this._monitor === null || on === this.hasOverride) return
      const values = on
        ? Object.fromEntries(
            Object.keys(BUTTON_KEYS).map((key) => [key, this._global(key)]),
          )
        : null
      this._write(withOverride(this._overrides(), this._monitor, values))
    }

    get_strv(key) {
      return this._value(key)
    }

    get_string(key) {
      return this._value(key)
    }

    get_int(key) {
      return this._value(key)
    }

    set_int(key, value) {
      this._set(key, value)
    }

    set_strv(key, value) {
      this._set(key, value)
    }

    set_string(key, value) {
      this._set(key, value)
    }

    reset(key) {
      if (this.hasOverride)
        this._set(key, this._settings.get_default_value(key).deepUnpack())
      else this._settings.reset(key)
    }

    destroy() {
      for (const id of this._ids) this._settings.disconnect(id)
      this._ids = []
    }

    _overrides() {
      return parseOverrides(this._settings.get_string(OVERRIDES_KEY))
    }

    _global(key) {
      switch (BUTTON_KEYS[key]) {
        case 'as':
          return this._settings.get_strv(key)
        case 'i':
          return this._settings.get_int(key)
        default:
          return this._settings.get_string(key)
      }
    }

    _value(key) {
      if (this._monitor !== null) {
        const own = overriddenValue(this._overrides(), this._monitor, key)
        if (own !== undefined) return own
      }
      return this._global(key)
    }

    _set(key, value) {
      if (!this.hasOverride) {
        const type = BUTTON_KEYS[key]
        if (type === 'as') this._settings.set_strv(key, value)
        else if (type === 'i') this._settings.set_int(key, value)
        else this._settings.set_string(key, value)
        return
      }
      this._write(withOverrideValue(this._overrides(), this._monitor, key, value))
    }

    _write(overrides) {
      this._settings.set_string(OVERRIDES_KEY, JSON.stringify(overrides))
    }

    _globalChanged(key) {
      if (this._monitor !== null) {
        const own = overriddenValue(this._overrides(), this._monitor, key)
        if (own !== undefined) return
      }
      this.emit(`changed::${key}`, key)
    }

    _emitAll() {
      for (const key of Object.keys(BUTTON_KEYS))
        this.emit(`changed::${key}`, key)
    }
  },
)
