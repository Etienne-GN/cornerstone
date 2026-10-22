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

export const CATALOG_KEY = 'mirror-indicator-catalog'
export const VISIBILITY_KEY = 'mirror-indicator-visibility'
export const EXCLUDED_ROLES = [
  'a11y',
  'dwellClick',
  'screencast',
  'screenRecording',
  'remoteAccess',
  'screenSharing',
  'keyboard',
  'power',
  'unsafeModeIndicator',
  'backgroundApps',
  'dateMenu',
  'activities',
  'quickSettings',
]

// Keep the source's own visibility separate from the primary-panel override
// so mirrors still see an icon the user only hid on the main monitor.
export const primaryVisibility = new WeakMap()

export function sourceIsVisible(actor) {
  return primaryVisibility.get(actor)?.visible ?? actor?.visible ?? false
}

export function monitorKey(display, index, primaryIndex) {
  if (index === primaryIndex) return 'main'

  const connector = display.get_monitor_plug_name?.(index)
  return connector ? `connector:${connector}` : `monitor:${index}`
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

const reportedInvalid = new Set()

export function readVisibility(settings) {
  const raw = settings.get_string(VISIBILITY_KEY)
  try {
    const value = JSON.parse(raw)
    return isPlainObject(value) ? value : {}
  } catch (e) {
    if (!reportedInvalid.has(raw)) {
      reportedInvalid.add(raw)
      console.error(
        `[cornerstone] mirror policy: invalid JSON in ${VISIBILITY_KEY}`,
        e,
      )
    }
    return {}
  }
}

export function indicatorIsEnabled(settings, key, role, fallback = true) {
  const value = readVisibility(settings)[key]?.[role]
  return typeof value === 'boolean' ? value : fallback
}

export function setIndicatorEnabled(settings, key, role, enabled) {
  const preferences = readVisibility(settings)
  const previous = preferences[key]
  preferences[key] = {
    ...(isPlainObject(previous) ? previous : {}),
    [role]: enabled,
  }
  settings.set_string(VISIBILITY_KEY, JSON.stringify(preferences))
}
