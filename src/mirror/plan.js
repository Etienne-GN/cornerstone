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

import { EXCLUDED_ROLES, sourceIsVisible } from './policy.js'

export const BOX_NAMES = ['left', 'center', 'right']

// Tray providers may insert wrappers around the real container, so equality
// alone would miss them.
function owns(child, indicator) {
  const container = indicator.container ?? indicator
  return (
    indicator === child ||
    container === child ||
    !!child.contains?.(container) ||
    !!container.contains?.(child)
  )
}

function roleForChild(child, statusArea, isEnabled) {
  for (const role in statusArea) {
    const indicator = statusArea[role]
    if (!indicator || EXCLUDED_ROLES.includes(role) || !isEnabled(role))
      continue
    if (owns(child, indicator)) return role
  }
  return null
}

export function planMirrors(boxes, statusArea, isEnabled) {
  const planned = new Set()
  const entries = []

  for (const box of BOX_NAMES) {
    let index = 0
    for (const child of boxes[box] ?? []) {
      if (!sourceIsVisible(child)) continue

      const role = roleForChild(child, statusArea, isEnabled)
      if (!role || planned.has(role)) continue

      planned.add(role)
      entries.push({ box, role, index: index++ })
    }
  }
  return entries
}
