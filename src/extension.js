/*
 * Cornerstone: one bar button, an Action Center and tray icons on every
 * monitor, as a companion to Dash to Panel or on GNOME's own top bar.
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

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

import { PanelSource } from './panels.js'
import { MirrorController } from './mirror/controller.js'
import { ActionCenter } from './actionCenter/actionCenter.js'
import { OneButton } from './button/oneButton.js'

function isolated(component, teardown) {
  try {
    teardown()
  } catch (e) {
    console.error(`[cornerstone] disable ${component}`, e)
  }
}

export default class CornerstoneExtension extends Extension {
  enable() {
    this._settings = this.getSettings()

    this._panels = new PanelSource()

    this._actionCenter = new ActionCenter(this._settings, this._panels)
    this._actionCenter.watchSetting()

    this._mirrorController = new MirrorController(this._settings, (actor) =>
      this._openActionCenter(actor),
    )

    // The one button owns the system menu slot the mirror would take.
    this._oneButton = new OneButton(
      this._settings,
      this._panels,
      this._actionCenter,
    )
    this._mirrorController.skipQuickSettings = () =>
      this._oneButton?.isActive ?? false
    // Its indicators can go to the overflow instead.
    this._mirrorController.indicatorsInOverflow = () =>
      this._oneButton?.isActive ?? false
    this._oneButton.onActiveChanged = () => this._mirrorController?.refresh()
    this._panels.connectObject(
      'changed',
      () => this._mirrorController?.attach(this._panels.dtpPanels),
      this,
    )

    this._panels.enable()
    this._oneButton.enable()
    this._mirrorController.attach(this._panels.dtpPanels)
  }

  get panels() {
    return this._panels ?? null
  }

  get mirrorController() {
    return this._mirrorController ?? null
  }

  get oneButton() {
    return this._oneButton ?? null
  }

  get actionCenter() {
    return this._actionCenter ?? null
  }

  // False leaves the click to the stock menu.
  _openActionCenter(actor) {
    if (!this._actionCenter?.isEnabled) return false

    this._actionCenter.toggle(actor)
    return true
  }

  disable() {
    // Each teardown step runs even when an earlier one throws.
    isolated('panel source', () => {
      this._panels?.disconnectObject(this)
      this._panels?.disable()
    })
    isolated('one button', () => this._oneButton?.destroy())
    this._oneButton = null
    isolated('action center', () => this._actionCenter?.destroy())
    this._actionCenter = null
    isolated('mirror controller', () => this._mirrorController?.destroy())
    this._mirrorController = null
    this._panels = null
    this._settings = null
  }
}
