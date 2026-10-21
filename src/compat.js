/*
 * Adapted from Multi Monitor Bar by Frederyk Abryan Palinoan, itself
 * derived from Multi Monitors Add-On by spin83.
 *
 * Copyright (C) 2025-2026  Frederyk Abryan Palinoan
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
import * as Config from 'resource:///org/gnome/shell/misc/config.js'
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js'

// PopupMenu.open()/close() take a PopupAnimation up to 50 and a params object
// from 51; the export of PopupAnimation survives on 51, so it cannot be probed.
export const IS_51 = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10) >= 51

export function menuOpen(menu, { animate = true } = {}) {
  if (IS_51) return menu.open({ animate })

  return menu.open(
    animate ? BoxPointer.PopupAnimation.FULL : BoxPointer.PopupAnimation.NONE,
  )
}

export function menuClose(menu, { animate = true } = {}) {
  if (IS_51) return menu.close({ animate })

  return menu.close(
    animate ? BoxPointer.PopupAnimation.FULL : BoxPointer.PopupAnimation.NONE,
  )
}

// The inverse of menuOpen/menuClose: what a caller's open()/close()
// argument asks for.
export function animateFromArg(arg) {
  if (IS_51) return { animate: arg?.animate !== false }

  return { animate: arg !== BoxPointer.PopupAnimation.NONE }
}

// St.BoxLayout:vertical was deprecated in 48 and removed in 51.
export function setBoxVertical(box, vertical) {
  if ('orientation' in box)
    box.orientation = vertical
      ? Clutter.Orientation.VERTICAL
      : Clutter.Orientation.HORIZONTAL
  else box.vertical = vertical
}

// St.BoxLayout gained `orientation` in 48; both supported shells have it.
export function verticalBoxProps() {
  return { orientation: Clutter.Orientation.VERTICAL }
}
