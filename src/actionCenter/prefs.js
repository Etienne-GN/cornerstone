/*
 * Action Center rows of the Omnibar preferences page.
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

const ENABLED_KEY = 'action-center'
const BANNER_CLICK_KEY = 'action-center-banner-click'

// The combo rows follow the enum values of BANNER_CLICK_KEY.
export class ActionCenterPreferences {
  constructor(builder, settings) {
    this._settings = settings
    this._syncing = false

    const enabledRow = builder.get_object('action_center_switch')
    this._bannerRow = builder.get_object('action_center_banner_click_combo')

    settings.bind(
      ENABLED_KEY,
      enabledRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    )
    settings.bind(
      ENABLED_KEY,
      this._bannerRow,
      'sensitive',
      Gio.SettingsBindFlags.GET,
    )

    this._syncBanner()
    this._rowId = this._bannerRow.connect('notify::selected', () => {
      if (this._syncing) return
      if (this._bannerRow.selected !== settings.get_enum(BANNER_CLICK_KEY))
        settings.set_enum(BANNER_CLICK_KEY, this._bannerRow.selected)
    })
    this._settingId = settings.connect(`changed::${BANNER_CLICK_KEY}`, () =>
      this._syncBanner(),
    )
  }

  _syncBanner() {
    this._syncing = true
    try {
      this._bannerRow.selected = this._settings.get_enum(BANNER_CLICK_KEY)
    } finally {
      this._syncing = false
    }
  }

  destroy() {
    if (this._settingId) this._settings.disconnect(this._settingId)
    if (this._rowId) this._bannerRow.disconnect(this._rowId)
    this._settingId = 0
    this._rowId = 0
  }
}
