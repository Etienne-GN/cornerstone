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

// Multiple secondary panels share each Astra source actor.
const retainedSources = new WeakMap()

export function retainAstraSourceHeight(source, panelBox, fallbackHeight) {
  let state = retainedSources.get(source)
  if (!state) {
    state = { users: 0, height: 0, saved: null, destroyed: false }

    const restore = () => {
      if (!state.saved) return
      const saved = state.saved
      state.saved = null
      Object.assign(source, saved)
    }
    const sync = () => {
      if (panelBox.mapped) {
        // Wait for the next normal allocation before caching a new
        // height; the current allocation may still be the pinned one.
        if (state.saved) {
          restore()
          source.queue_relayout()
          return
        }
        if (source.has_allocation()) {
          const height = source.get_allocation_box().get_height()
          if (height > 0) state.height = height
        }
      } else if (!state.saved) {
        const height = state.height || fallbackHeight()
        if (!(height > 0)) return
        // Pin the SOURCE request, not just the clone: otherwise Clutter
        // can allocate a taller hidden source and scale its icons down.
        state.saved = {
          min_height: source.min_height,
          natural_height: source.natural_height,
          min_height_set: source.min_height_set,
          natural_height_set: source.natural_height_set,
        }
        source.set_height(height)
      }
    }
    const panelId = panelBox.connect('notify::mapped', sync)
    const allocationId = source.connect('notify::allocation', sync)
    const destroyId = source.connect('destroy', () => {
      state.destroyed = true
      panelBox.disconnect(panelId)
      retainedSources.delete(source)
    })
    state.release = () => {
      if (state.destroyed) return
      panelBox.disconnect(panelId)
      source.disconnect(allocationId)
      source.disconnect(destroyId)
      restore()
      retainedSources.delete(source)
    }
    retainedSources.set(source, state)
    sync()
  }
  state.users++
  let released = false
  return () => {
    if (released) return
    released = true
    if (--state.users === 0) state.release()
  }
}
