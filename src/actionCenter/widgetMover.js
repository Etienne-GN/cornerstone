// Moves actors into new parents and puts them back where they came from.
export class WidgetMover {
  constructor() {
    this._records = []
  }

  move(actor, newParent, index = -1) {
    let record = this._records.find((r) => r.actor === actor)
    if (!record) {
      const parent = actor.get_parent()
      record = {
        actor,
        parent,
        sibling: actor.get_next_sibling(),
        index: parent ? parent.get_children().indexOf(actor) : -1,
      }
      this._records.push(record)
      // An actor destroyed while moved has nothing to go back.
      actor.connectObject?.('destroy', () => this._forget(actor), this)
    }

    const current = actor.get_parent()
    if (current === newParent) {
      if (index >= 0 && newParent.get_child_at_index(index) !== actor)
        newParent.set_child_at_index(actor, index)
      return
    }

    current?.remove_child(actor)
    if (index < 0) newParent.add_child(actor)
    else newParent.insert_child_at_index(actor, index)
  }

  // Puts one moved actor back; it is no longer tracked.
  restore(actor) {
    const index = this._records.findIndex((r) => r.actor === actor)
    if (index < 0) return

    const [record] = this._records.splice(index, 1)
    actor.disconnectObject?.(this)
    this._restore(record)
  }

  _forget(actor) {
    this._records = this._records.filter((r) => r.actor !== actor)
  }

  isMoved(actor) {
    return this._records.some((r) => r.actor === actor)
  }

  restoreAll() {
    const records = this._records.reverse()
    this._records = []

    for (const record of records) {
      record.actor.disconnectObject?.(this)
      try {
        this._restore(record)
      } catch (e) {
        console.error('[cornerstone] action center: restoring a widget failed', e)
      }
    }
  }

  _restore({ actor, parent, sibling, index }) {
    const current = actor.get_parent()
    if (current === parent) return

    current?.remove_child(actor)
    if (!parent) return

    if (sibling && sibling.get_parent() === parent)
      parent.insert_child_below(actor, sibling)
    else if (index >= 0 && index <= parent.get_n_children())
      parent.insert_child_at_index(actor, index)
    else parent.add_child(actor)
  }
}
