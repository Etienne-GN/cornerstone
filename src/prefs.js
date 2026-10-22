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

import Gtk from 'gi://Gtk'

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import { MirrorPreferences } from './mirror/prefs.js'
import { ActionCenterPreferences } from './actionCenter/prefs.js'

export default class CornerstonePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings()
    window._settings = settings

    const builder = new Gtk.Builder()
    builder.set_translation_domain(this.metadata['gettext-domain'])
    builder.add_from_file(`${this.path}/ui/SettingsCornerstone.ui`)
    const page = builder.get_object('cornerstone')
    window.add(page)

    const parts = [
      new ActionCenterPreferences(builder, settings),
      new MirrorPreferences(page, settings, builder.get_object('mirrorGroup')),
    ]
    window.connect('close-request', () => {
      for (const part of parts) part.destroy()
      return false
    })
  }
}
