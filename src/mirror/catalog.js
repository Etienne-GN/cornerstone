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

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import St from 'gi://St'

import { CATALOG_KEY, EXCLUDED_ROLES, monitorKey } from './policy.js'
import { indicatorNames } from '../button/indicators.js'

// The first icon seen per actor: icons that change with state (volume,
// battery) would otherwise rewrite the setting on every change.
const firstIcons = new WeakMap()

function findIcon(actor) {
  if (actor instanceof St.Icon) return actor
  for (const child of actor?.get_children?.() ?? []) {
    const icon = findIcon(child)
    if (icon) return icon
  }
  return null
}

function iconFor(actor) {
  if (!actor) return ''
  if (!firstIcons.has(actor)) {
    const icon = findIcon(actor)
    const name = icon?.gicon?.to_string?.() ?? icon?.icon_name ?? ''
    if (!name) return ''
    firstIcons.set(actor, name)
  }
  return firstIcons.get(actor)
}

// The quick settings indicators the one button can show, by name.
function catalogIndicators() {
  const quickSettings = Main.panel.statusArea.quickSettings
  if (!quickSettings?._indicators) return []
  return indicatorNames(quickSettings).map(({ child, name }) => ({
    name,
    icon: iconFor(child),
    // Changes only when GNOME shows or hides an indicator.
    visible: child.visible,
  }))
}

// Main.panel and the policy key 'main' follow dash-to-panel's primary
// monitor, which is not necessarily the system one.
export function dtpPrimaryIndex(panelManager) {
  return (
    panelManager?.dtpPrimaryMonitor?.index ?? Main.layoutManager.primaryIndex
  )
}

function roleLabel(role) {
  const name = Main.panel.statusArea[role]?.accessible_name
  return name ? `${name} (${role})` : role
}

function catalogRoles() {
  return Object.keys(Main.panel.statusArea)
    .filter(
      (role) => Main.panel.statusArea[role] && !EXCLUDED_ROLES.includes(role),
    )
    .map((role) => ({
      role,
      label: roleLabel(role),
      icon: iconFor(Main.panel.statusArea[role]),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// Preferences run in a separate process and cannot reach shell actors, so
// the shell describes monitors and roles through a setting.
// `tray` lists the tray icons in GNOME's order with their box.
export function publishCatalog(settings, panelManager, tray = []) {
  const primary = dtpPrimaryIndex(panelManager)
  const monitors = Main.layoutManager.monitors
  const order = [
    primary,
    ...monitors.map((_m, index) => index).filter((index) => index !== primary),
  ].filter((index) => monitors[index])

  const catalog = JSON.stringify({
    monitors: order.map((index) => ({
      key: monitorKey(global.display, index, primary),
      primary: index === primary,
      connector: global.display.get_monitor_plug_name?.(index) ?? '',
      width: monitors[index].width,
      height: monitors[index].height,
    })),
    roles: catalogRoles(),
    tray: tray.map(({ role, box }) => ({ role, box })),
    indicators: catalogIndicators(),
  })

  if (settings.get_string(CATALOG_KEY) !== catalog)
    settings.set_string(CATALOG_KEY, catalog)
}

export function clearCatalog(settings) {
  settings.set_string(CATALOG_KEY, '{}')
}
