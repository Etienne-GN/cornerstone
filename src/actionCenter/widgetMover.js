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
    }

    const current = actor.get_parent()
    if (current === newParent) return

    current?.remove_child(actor)
    if (index < 0) newParent.add_child(actor)
    else newParent.insert_child_at_index(actor, index)
  }

  restoreAll() {
    const records = this._records.reverse()
    this._records = []

    for (const record of records) {
      try {
        this._restore(record)
      } catch (e) {
        console.error('[omnibar] action center: restoring a widget failed', e)
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
