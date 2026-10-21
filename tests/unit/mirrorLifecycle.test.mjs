import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { loadGjs } from './lib/loadGjs.mjs'

const path = fileURLToPath(
  new URL('../../src/mirror/mirroredIndicatorButton.js', import.meta.url),
)

let nextSignalId = 1
class Actor {
  constructor(props = {}) {
    this.children = []
    this.handlers = new Map()
    this.styleClasses = new Set()
    this.pseudoClasses = new Set()
    this.visible = true
    this.width = 24
    this.height = 24
    const { style_class: styleClass, ...rest } = props
    for (const name of (styleClass ?? '').split(' ').filter(Boolean))
      this.styleClasses.add(name)
    Object.assign(this, rest)
  }
  _init() {}
  add_child(child) {
    this.children.push(child)
    child.parent = this
  }
  remove_child(child) {
    this.children.splice(this.children.indexOf(child), 1)
    child.parent = null
  }
  get_children() {
    return this.children.slice()
  }
  get_first_child() {
    return this.children[0] ?? null
  }
  get_n_children() {
    return this.children.length
  }
  get_parent() {
    return this.parent ?? null
  }
  destroy_all_children() {
    for (const child of this.get_children()) child.destroy()
    this.children = []
  }
  get_style_class_name() {
    return [...this.styleClasses].join(' ')
  }
  set_style_class_name(name) {
    this.styleClasses = new Set(name.split(' '))
  }
  add_style_class_name(name) {
    this.styleClasses.add(name)
  }
  remove_style_class_name(name) {
    this.styleClasses.delete(name)
  }
  add_style_pseudo_class(name) {
    this.pseudoClasses.add(name)
  }
  remove_style_pseudo_class(name) {
    this.pseudoClasses.delete(name)
  }
  get_allocation_box() {
    return { get_width: () => this.width, get_height: () => this.height }
  }
  get_preferred_width() {
    return [this.width, this.width]
  }
  get_preferred_height() {
    return [this.height, this.height]
  }
  set_size(width, height) {
    Object.assign(this, { width, height })
  }
  set_height(height) {
    this.height = height
  }
  queue_relayout() {}
  connect(signal, callback) {
    const id = nextSignalId++
    this.handlers.set(id, { signal, callback })
    return id
  }
  disconnect(id) {
    assert.ok(this.handlers.delete(id), `unknown handler ${id}`)
  }
  connectObject(...args) {
    const owner = args.pop()
    for (let i = 0; i < args.length; i += 2)
      this.handlers.set(nextSignalId++, {
        signal: args[i],
        callback: args[i + 1],
        owner,
      })
  }
  disconnectObject(owner) {
    for (const [id, handler] of this.handlers)
      if (handler.owner === owner) this.handlers.delete(id)
  }
  emit(signal, ...args) {
    for (const handler of [...this.handlers.values()])
      if (handler.signal === signal) handler.callback(this, ...args)
  }
  destroy() {
    this.destroyed = true
    this.emit('destroy')
  }
}

class PanelButton extends Actor {
  constructor(...args) {
    super()
    this._init(...args)
  }
}
class Label extends Actor {
  constructor(props = {}) {
    super(props)
    this.text ??= ''
  }
  bind_property(_name, target) {
    target.text = this.text
    target.bound = true
    return {
      unbind() {
        target.bound = false
      },
    }
  }
  destroy() {
    assert.notEqual(this.bound, true, 'unbind before destroying the label')
    super.destroy()
  }
}
class Icon extends Actor {}
class BoxLayout extends Actor {}
class Clone extends Actor {}

const registered = []
const removedSources = []
const timeouts = new Map()
let nextTimeout = 100
const menuCalls = []
const workAreaRequests = []

const fakes = {
  St: {
    Widget: Actor,
    BoxLayout,
    Label,
    Icon,
    Button: Actor,
    Bin: Actor,
    Side: { TOP: 0, BOTTOM: 1 },
  },
  Clutter: {
    LayoutManager: class {},
    Clone,
    BinLayout: class {},
    ActorBox: class {},
    ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
    Orientation: { HORIZONTAL: 0, VERTICAL: 1 },
    EventType: { BUTTON_PRESS: 1, SCROLL: 2 },
    EVENT_STOP: true,
    EVENT_PROPAGATE: false,
    BUTTON_PRIMARY: 1,
    BUTTON_SECONDARY: 3,
  },
  GObject: {
    registerClass(...args) {
      registered.push([args.length > 1 ? args[0] : {}, args.at(-1).name])
      return args.at(-1)
    },
    signal_lookup: () => 1,
    BindingFlags: { SYNC_CREATE: 1 },
  },
  GLib: {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    SOURCE_CONTINUE: true,
    timeout_add(_priority, _ms, callback) {
      timeouts.set(++nextTimeout, callback)
      return nextTimeout
    },
    timeout_add_seconds(_priority, _s, callback) {
      timeouts.set(++nextTimeout, callback)
      return nextTimeout
    },
    source_remove(id) {
      removedSources.push(id)
      timeouts.delete(id)
    },
  },
  Main: {
    panel: { statusArea: {}, height: 32 },
    layoutManager: {
      primaryIndex: 0,
      panelBox: new Actor(),
      findIndexForActor: () => 1,
      getWorkAreaForMonitor(index) {
        workAreaRequests.push(index)
        return null
      },
      monitors: [],
    },
    wm: { handleWorkspaceScroll() {} },
  },
  PanelMenu: { Button: PanelButton },
  global: {
    workspace_manager: { get_workspace_by_index: () => ({}) },
    display: {},
  },
  retainAstraSourceHeight: () => () => {},
  sourceIsVisible: (actor) => actor?.visible ?? false,
  setBoxVertical(box, vertical) {
    box.vertical = vertical
  },
  menuOpen(menu, params) {
    menuCalls.push(['open', JSON.stringify(params)])
    menu.isOpen = true
  },
  menuClose(menu, params) {
    menuCalls.push(['close', JSON.stringify(params)])
    menu.isOpen = false
  },
}

const { MirroredIndicatorButton } = loadGjs(path, fakes)
const proto = MirroredIndicatorButton.prototype
const bare = (fields = {}) => Object.assign(Object.create(proto), fields)

const makeSource = (role, child) => {
  const source = new Actor()
  if (child) source.add_child(child)
  fakes.Main.panel.statusArea[role] = source
  return source
}

test('missing source yields an empty, inert mirror', () => {
  const mirror = new MirroredIndicatorButton(
    { monitorIndex: 1, menuManager: null, vertical: false },
    'absent',
  )
  assert.equal(mirror._omniMirror, true)
  assert.equal(mirror.isEmpty, true)
  assert.equal(mirror.visible, false)
  assert.equal(mirror.reactive, false)
  mirror.destroy()
})

test('excluded roles have no special branch', () => {
  for (const role of ['activities', 'dateMenu']) {
    const box = new BoxLayout()
    box.add_child(new Label({ text: '12:00' }))
    const source = makeSource(role, box)
    source._clockDisplay = new Label({ text: '12:00' })
    const mirror = new MirroredIndicatorButton({ vertical: false }, role)
    assert.equal(mirror.name, undefined, role)
    assert.equal(mirror._clockDisplay, undefined, role)
    assert.equal(mirror._workspaceDotsBox, undefined, role)
    mirror.destroy()
    delete fakes.Main.panel.statusArea[role]
  }
})

test('generic mirror clones without reparenting or resizing the source', () => {
  const box = new BoxLayout({ style_class: 'panel-status-menu-box' })
  box.add_child(new Label({ text: '42' }))
  const source = makeSource('demo', box)
  const before = source.handlers.size
  const mirror = new MirroredIndicatorButton({ vertical: false }, 'demo')
  assert.equal(mirror.isEmpty, false)
  assert.equal(mirror.visible, true)
  assert.equal(box.parent, source, 'source child stays in place')
  assert.deepEqual(source.children, [box])
  assert.equal(box.width, 24, 'source child is not resized')
  const clone = mirror.children[0].children[0].children[0]
  assert.ok(clone instanceof Clone)
  assert.equal(clone.source, box)

  box.visible = false
  box.emit('notify::visible')
  assert.equal(mirror.isEmpty, true, 'presence follows the source')
  box.visible = true
  box.emit('notify::visible')
  assert.equal(mirror.isEmpty, false)

  mirror.destroy()
  assert.equal(source.handlers.size, before, 'source handlers released')
  assert.equal(box.handlers.size, 0, 'source child handlers released')
  assert.equal(source.destroyed, undefined, 'source is never destroyed')
  delete fakes.Main.panel.statusArea.demo
})

test('source destruction destroys the mirror', () => {
  const box = new BoxLayout()
  box.add_child(new Label({ text: 'x' }))
  const source = makeSource('gone', box)
  const mirror = new MirroredIndicatorButton({ vertical: false }, 'gone')
  source.destroy()
  assert.equal(mirror.destroyed, true)
  assert.equal(mirror._sourceIndicator, null)
  delete fakes.Main.panel.statusArea.gone
})

test('cleanup releases everything and is idempotent', () => {
  removedSources.length = 0
  const released = []
  const live = {
    disconnect(id) {
      released.push(id)
    },
    disconnectObject() {},
    unbind() {
      released.push('unbind')
    },
    get_first_child() {
      assert.fail('cleanup must not traverse source children')
    },
  }
  const removedMenus = []
  const mirror = bare({
    _host: { menuManager: { removeMenu: (m) => removedMenus.push(m) } },
    _sourceIndicator: live,
    _sourcePresenceChild: live,
    _sourceDestroyId: 10,
    _labelCopyBindings: [live],
    _quickSettingsSource: live,
    _sourceSizeChangedId: 11,
    _allocationCloneSignals: [{ source: live, id: 12 }],
    _workspacePreviewWindowSignalIds: [{ object: live, id: 13 }],
    _forwardClickTimeoutId: 14,
    _allocationCloneTimeouts: [15],
    _workspaceSourceMenuRegistered: 'menu',
    _genericMenuPendingRestore() {
      released.push('restore')
    },
  })
  mirror._cleanup()
  assert.equal(mirror._sourceIndicator, null)
  assert.equal(mirror._sourcePresenceChild, null)
  assert.equal(mirror._quickSettingsSource, null)
  assert.equal(mirror._genericMenuPendingRestore, null)
  assert.equal(mirror._host, null)
  assert.deepEqual(removedSources, [14, 15])
  assert.deepEqual(removedMenus, ['menu'])
  for (const id of [10, 11, 12, 13, 'unbind', 'restore'])
    assert.ok(released.includes(id), String(id))
  mirror._cleanup()
  assert.deepEqual(removedSources, [14, 15], 'cleanup must be idempotent')
})

// Issue #40 upstream: repeated refreshes must destroy every retired copy
// while JS can still run destroy handlers, and unbind before destruction.
test('20 label refreshes destroy retired copies and keep the source', () => {
  const sourceLabel = new Label()
  const mirror = bare({
    _role: 'vitals',
    _isClipboardIndicator: () => false,
    _findAllDisplayWidgets: () => [sourceLabel],
  })
  const container = new BoxLayout()
  for (let i = 0; i < 20; i++) {
    const previous = container.get_children()
    sourceLabel.text = String(i)
    mirror._copyIconsFromSource(container, sourceLabel)
    assert.ok(
      previous.every((child) => child.destroyed),
      'retired destroyed',
    )
    assert.equal(container.children.length, 1)
    assert.equal(container.children[0].text, String(i))
    assert.equal(mirror._labelCopyBindings.length, 1)
    assert.equal(sourceLabel.destroyed, undefined, 'source label borrowed')
  }
  mirror._disconnectLabelCopyBindings()
  container.destroy_all_children()
})

test('static copies only for listed extensions, not any role with "arc"', () => {
  const route = (role) => {
    const calls = []
    bare({
      _role: role,
      _createStaticIconCopy: () => calls.push('static'),
      _createAllocationMatchedClone: () => calls.push('clone'),
    })._createSimpleClone(new Actor(), new Actor())
    return calls[0]
  }
  assert.equal(route('arcmenu@arcmenu.com'), 'static')
  assert.equal(route('ArcMenu'), 'static')
  assert.equal(route('arc-menu'), 'static')
  assert.equal(route('vitals'), 'static')
  assert.equal(route('search-light'), 'clone')
  assert.equal(route('search'), 'clone')
  assert.equal(route('kopia-status'), 'clone')
  assert.equal(bare({ _role: 'search' })._shouldSkipStaticLabelCopy(), false)
  assert.equal(bare({ _role: 'arcmenu' })._shouldSkipStaticLabelCopy(), true)
})

test('quickSettings click goes to host.openActionCenter when provided', () => {
  const opened = []
  const mirror = bare({
    _role: 'quickSettings',
    _sourceIndicator: { menu: {} },
    _host: { openActionCenter: (actor) => opened.push(actor) },
    _openQuickSettingsMenu: () => assert.fail('stock menu must not open'),
  })
  assert.equal(mirror._onButtonPress(null), fakes.Clutter.EVENT_STOP)
  assert.deepEqual(opened, [mirror])

  let stock = 0
  const plain = bare({
    _role: 'quickSettings',
    _sourceIndicator: { menu: {} },
    _host: {},
    _openQuickSettingsMenu: () => ++stock,
  })
  plain._onButtonPress(null)
  assert.equal(stock, 1)
})

test('quick settings priming opens and closes without animation', () => {
  menuCalls.length = 0
  timeouts.clear()
  const menu = { isOpen: false, actor: new Actor(), sourceActor: null }
  const mirror = bare({
    _sourceIndicator: Object.assign(new Actor(), { menu }),
    _openQuickSettingsMirroredMenu: () => menuCalls.push(['mirrored']),
  })
  mirror._primeQuickSettingsMenuThenOpen()
  assert.equal(menu.actor.opacity, 0, 'primed menu is invisible')
  for (const [id, callback] of timeouts) {
    timeouts.delete(id)
    callback()
  }
  for (const [id, callback] of timeouts) {
    timeouts.delete(id)
    callback()
  }
  assert.deepEqual(menuCalls, [
    ['open', '{"animate":false}'],
    ['close', '{"animate":false}'],
    ['mirrored'],
  ])
  assert.equal(mirror._quickSettingsMenuPrimed, true)
})

test('host monitorIndex and menuManager are used', () => {
  workAreaRequests.length = 0
  bare({ _host: { monitorIndex: 2 } })._populateWorkspacePreviewLayer(
    new Actor(),
    0,
    true,
  )
  assert.deepEqual(workAreaRequests, [2])

  const added = []
  const menu = {}
  const mirror = bare({
    _sourceIndicator: { menu },
    _host: { menuManager: { addMenu: (m) => added.push(m) } },
  })
  mirror._registerWorkspaceSourceMenu()
  mirror._registerWorkspaceSourceMenu()
  assert.deepEqual(added, [menu])
})

test('syncOrientation restyles the workspace name and tracks host default', () => {
  const icon = new Icon()
  const label = new Label({ style_class: 'status-label' })
  const mirror = bare({
    _host: { vertical: true },
    _workspaceNameIcon: icon,
    _workspaceNameLabel: label,
  })
  assert.equal(mirror._isVertical(), true, 'falls back to host.vertical')
  mirror.syncOrientation(false)
  assert.equal(mirror._isVertical(), false)
  assert.equal(icon.visible, true)
  assert.equal(label.get_style_class_name(), 'status-label')
  mirror.syncOrientation(true)
  assert.equal(icon.visible, false)
  assert.equal(label.get_style_class_name(), 'mm-workspace-name')
  assert.equal('_syncPanelOrientation' in proto, false)
})

test('dead MMB code is gone', () => {
  for (const name of [
    '_initActivitiesButton',
    '_updateWorkspaceDots',
    '_applyNormalMode',
    '_applyOverviewMode',
    '_detectAndLockWidth',
    '_onSourceWidthChanged',
    '_monitorSize',
    '_isPrimaryMonitorFullscreen',
    '_createClockDisplay',
  ])
    assert.equal(name in proto, false, name)

  const source = readFileSync(path, 'utf8')
  for (const pattern of [
    /_lockSizeTimeoutId/,
    /_sizeDebounceId/,
    /_overviewShowingId/,
    /shellVersion/,
    /_panel\b/,
    /'activities'/,
    /'dateMenu'/,
    /_mmp?_?[A-Za-z]/,
  ])
    assert.doesNotMatch(source, pattern)
})

test('mirrored menus open and close animated through compat', () => {
  menuCalls.length = 0
  const menu = Object.assign(new Actor(), { isOpen: false, sourceActor: null })
  const mirror = bare({
    pseudoClasses: new Set(),
    _sourceIndicator: Object.assign(new Actor(), { menu }),
  })
  mirror._openMirroredMenu()
  assert.equal(menu.isOpen, true)
  mirror._openMirroredMenu()
  assert.deepEqual(menuCalls, [
    ['open', undefined],
    ['close', undefined],
  ])

  const source = readFileSync(path, 'utf8')
  assert.doesNotMatch(source, /\.(open|close)\(\)/)
})

test('GType names are namespaced to avoid clashing with MMB', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(registered)), [
    [
      { GTypeName: 'OmnibarWorkspacePreviewLayout' },
      'MMWorkspacePreviewLayout',
    ],
    [
      { GTypeName: 'OmnibarMirroredIndicatorButton' },
      'MirroredIndicatorButton',
    ],
  ])
})
