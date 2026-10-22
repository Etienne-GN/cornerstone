/*
 * Per-monitor overrides of the one button's settings, kept as JSON in one
 * setting: { monitorKey: { key: value, ... } }.
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

export const OVERRIDES_KEY = 'button-monitor-overrides'

// The settings a monitor can override, with their GSettings type.
export const BUTTON_KEYS = {
  'button-elements': 'as',
  'button-indicator-order': 'as',
  'button-hidden-indicators': 'as',
  'clock-format': 's',
  'clock-font': 's',
  'button-spacing': 'i',
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function validValue(key, value) {
  const type = BUTTON_KEYS[key]
  if (type === 's') return typeof value === 'string'
  if (type === 'i') return Number.isInteger(value)
  if (type === 'as')
    return Array.isArray(value) && value.every((v) => typeof v === 'string')
  return false
}

const reported = new Set()

// Overrides with unknown keys and wrong types dropped.
export function parseOverrides(raw) {
  let value
  try {
    value = JSON.parse(raw)
  } catch (e) {
    if (!reported.has(raw)) {
      reported.add(raw)
      console.error(`[cornerstone] button: invalid JSON in ${OVERRIDES_KEY}`, e)
    }
    return {}
  }
  if (!isPlainObject(value)) return {}

  const overrides = {}
  for (const [monitor, values] of Object.entries(value)) {
    if (!isPlainObject(values)) continue
    const kept = {}
    for (const [key, v] of Object.entries(values))
      if (validValue(key, v)) kept[key] = v
    overrides[monitor] = kept
  }
  return overrides
}

// The monitor's own value for `key`, or undefined to follow every monitor.
export function overriddenValue(overrides, monitor, key) {
  const value = overrides[monitor]?.[key]
  return value !== undefined && validValue(key, value) ? value : undefined
}

// `values` (every key) for the monitor, or null to drop its override.
export function withOverride(overrides, monitor, values) {
  const next = { ...overrides }
  if (values) next[monitor] = { ...values }
  else delete next[monitor]
  return next
}

export function withOverrideValue(overrides, monitor, key, value) {
  return {
    ...overrides,
    [monitor]: { ...(overrides[monitor] ?? {}), [key]: value },
  }
}
