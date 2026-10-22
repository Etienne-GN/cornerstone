/*
 * The About page.
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

import Adw from 'gi://Adw'
import Gtk from 'gi://Gtk'

import { _ } from './i18n.js'

export class AboutPage {
  constructor(metadata) {
    this.page = new Adw.PreferencesPage({
      title: _('About'),
      icon_name: 'help-about-symbolic',
    })

    const header = new Adw.PreferencesGroup()
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_top: 12,
      margin_bottom: 12,
    })
    box.append(
      new Gtk.Label({
        label: metadata.name ?? 'Cornerstone',
        css_classes: ['title-1'],
      }),
    )
    box.append(
      new Gtk.Label({
        label: `${_('Version')} ${metadata.version ?? ''}`,
        css_classes: ['dim-label'],
      }),
    )
    header.add(box)
    this.page.add(header)

    const links = new Adw.PreferencesGroup()
    if (metadata.url) {
      const row = new Adw.ActionRow({
        title: _('Website and issues'),
        subtitle: metadata.url,
        activatable: true,
      })
      row.add_suffix(new Gtk.Image({ icon_name: 'adw-external-link-symbolic' }))
      row.connect('activated', () =>
        Gtk.show_uri(row.get_root(), metadata.url, 0),
      )
      links.add(row)
    }
    this.page.add(links)

    const credits = new Adw.PreferencesGroup({ title: _('Credits') })
    for (const [title, subtitle] of [
      [
        'Multi Monitor Bar',
        _('Tray mirroring, by Frederyk Abryan Palinoan, from spin83’s Multi Monitors Add-On'),
      ],
      ['GNOME Shell', _('The quick settings, notifications and calendar')],
      [
        'Dash to Panel',
        _('Where Cornerstone started, by Jason DeRose, Charles Gagnon and contributors'),
      ],
    ])
      credits.add(new Adw.ActionRow({ title, subtitle }))
    this.page.add(credits)

    const license = new Adw.PreferencesGroup()
    license.add(
      new Adw.ActionRow({
        title: _('License'),
        subtitle: 'GPL-2.0-or-later',
      }),
    )
    this.page.add(license)
  }

  destroy() {}
}
