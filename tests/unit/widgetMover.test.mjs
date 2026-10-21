import { test } from 'node:test'
import assert from 'node:assert/strict'

import { WidgetMover } from '../../src/actionCenter/widgetMover.js'

class Actor {
  constructor(name) {
    this.name = name
    this.children = []
    this.parent = null
  }
  get_parent() {
    return this.parent
  }
  get_children() {
    return this.children.slice()
  }
  get_n_children() {
    return this.children.length
  }
  get_next_sibling() {
    const siblings = this.parent?.children ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }
  add_child(child) {
    assert.equal(child.parent, null, `${child.name} already has a parent`)
    this.children.push(child)
    child.parent = this
  }
  insert_child_at_index(child, index) {
    assert.equal(child.parent, null, `${child.name} already has a parent`)
    if (index < 0 || index > this.children.length) this.children.push(child)
    else this.children.splice(index, 0, child)
    child.parent = this
  }
  insert_child_below(child, sibling) {
    assert.equal(child.parent, null, `${child.name} already has a parent`)
    if (sibling === null) {
      this.children.unshift(child)
    } else {
      assert.equal(sibling.parent, this, 'sibling is not a child')
      this.children.splice(this.children.indexOf(sibling), 0, child)
    }
    child.parent = this
  }
  remove_child(child) {
    assert.equal(child.parent, this, `${child.name} is not a child`)
    this.children.splice(this.children.indexOf(child), 1)
    child.parent = null
  }
  contains(actor) {
    for (let a = actor; a; a = a.parent) if (a === this) return true
    return false
  }
}

function tree(...names) {
  const parent = new Actor('parent')
  const kids = names.map((n) => new Actor(n))
  for (const k of kids) parent.add_child(k)
  return [parent, ...kids]
}

const names = (actor) => actor.get_children().map((c) => c.name)

test('restores to the original index between siblings', () => {
  const [parent, a, b, c] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(b, host)
  assert.deepEqual(names(parent), ['a', 'c'])
  assert.equal(b.get_parent(), host)

  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'c'])
  assert.equal(host.get_n_children(), 0)
  assert.ok(a && c)
})

test('restores before the recorded sibling when one was added meanwhile', () => {
  const [parent, , b] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(b, host)
  parent.insert_child_at_index(new Actor('x'), 0)
  mover.restoreAll()
  assert.deepEqual(names(parent), ['x', 'a', 'b', 'c'])
})

test('restores at the recorded index when the sibling was removed', () => {
  const [parent, , b, c, d] = tree('a', 'b', 'c', 'd')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(b, host)
  parent.remove_child(c)
  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'd'])
  assert.ok(d)
})

test('appends when the recorded index is past the end', () => {
  const [parent, a, b, c] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(c, host)
  parent.remove_child(a)
  parent.remove_child(b)
  mover.restoreAll()
  assert.deepEqual(names(parent), ['c'])
})

test('a last child goes back last', () => {
  const [parent, , , c] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(c, host)
  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'c'])
})

test('inserts at the requested index in the new parent', () => {
  const [, , b] = tree('a', 'b', 'c')
  const [host] = tree('h1', 'h2')
  const mover = new WidgetMover()

  mover.move(b, host, 1)
  assert.deepEqual(names(host), ['h1', 'b', 'h2'])
})

test('moving twice keeps the first origin', () => {
  const [parent, , b] = tree('a', 'b', 'c')
  const host1 = new Actor('host1')
  const host2 = new Actor('host2')
  const mover = new WidgetMover()

  mover.move(b, host1)
  mover.move(b, host2)
  assert.equal(b.get_parent(), host2)
  assert.equal(host1.get_n_children(), 0)

  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'c'])
  assert.equal(host2.get_n_children(), 0)
})

test('moving to the current parent again is a no-op', () => {
  const [parent, , b] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(b, host)
  mover.move(b, host)
  assert.deepEqual(names(host), ['b'])
  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'c'])
})

test('restores in reverse order of moves', () => {
  const [parent, a, b] = tree('a', 'b')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(a, host)
  mover.move(b, host)
  assert.equal(parent.get_n_children(), 0)

  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b'])
})

test('restoreAll is idempotent', () => {
  const [parent, , b] = tree('a', 'b', 'c')
  const host = new Actor('host')
  const mover = new WidgetMover()

  mover.move(b, host)
  mover.restoreAll()
  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b', 'c'])
})

test('a failed restore is logged and the rest still restored', (t) => {
  const [parent, a, b] = tree('a', 'b')
  const [other, x] = tree('x')
  const host = new Actor('host')
  const mover = new WidgetMover()
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args))

  mover.move(a, host)
  mover.move(x, host)
  mover.move(b, host)
  other.insert_child_at_index = () => {
    throw new Error('gone')
  }
  other.insert_child_below = other.insert_child_at_index

  mover.restoreAll()
  assert.deepEqual(names(parent), ['a', 'b'])
  assert.equal(x.get_parent(), null, 'unrestorable actor left in the host')
  assert.equal(host.get_n_children(), 0)
  assert.equal(errors.length, 1)
  assert.match(String(errors[0][0]), /\[omnibar\]/)
})
