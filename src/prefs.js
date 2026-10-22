/*
 * Cornerstone preferences window.
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

import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import { setGettext } from './prefs/i18n.js'
import { ButtonPage } from './prefs/buttonPage.js'
import { ActionCenterPage } from './prefs/actionCenterPage.js'
import { TrayPage } from './prefs/trayPage.js'
import { AboutPage } from './prefs/aboutPage.js'

export default class CornerstonePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    setGettext(_)
    const settings = this.getSettings()
    window._settings = settings
    window.set_default_size(720, 860)
    window.search_enabled = true

    const pages = [
      new ButtonPage(settings),
      new ActionCenterPage(settings),
      new TrayPage(settings),
      new AboutPage(this.metadata),
    ]
    for (const { page } of pages) window.add(page)
    window.connect('close-request', () => {
      for (const page of pages) page.destroy()
      return false
    })
  }
}
