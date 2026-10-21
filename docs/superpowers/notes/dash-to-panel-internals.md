# dash-to-panel internals — research notes (upstream c3aed93; line numbers may have
# shifted slightly after Tasks 3-5, re-locate by name)

## Panel creation (src/panelManager.js)
- `PanelManager.enable(reset)` :65. Primary panel `_createPanel(dtpPrimaryMonitor,
  keepGsTopPanel)` :92-96 (not standalone unless stockgs-keep-top-panel: reuses
  Main.panel). Secondary panels only if setting `multi-monitors`, always standalone
  :102-108.
- `_createPanel(monitor, isStandalone)` :666-717 → `new Panel.Panel(this, monitor,
  clipContainer, panelBox, isStandalone)`, `panel.enable()`, chrome tracking,
  `panel.intellihide.init()`, `_adjustPanelMenuButton` on PanelMenu.Buttons (710-712,
  729-751), `taskbar.iconAnimator.start()`.
- `global.dashToPanel.panels = this.allPanels; emit('panels-created')` :110-111 — runs on
  first enable AND every `_reset` (before `if (reset) return` at :120). Natural hook.
- `_reset()` :719-723 = `disable(true)` + clear allPanels + `enable(true)`. Triggered by
  settings primary-monitor, multi-monitors, isolate-monitors, panel-positions,
  panel-lengths, panel-anchors, stockgs-keep-top-panel (:240-255) and monitors-changed
  (:279-290). `changed::panel-element-positions` → `p.updateElementPositions()` only
  (:256-263, 725-727).
- `PanelManager.disable()` :319-426: each `p.disable()` (345), standalone
  `p.panelBox.destroy()` (350-351). Teardown of mirrors must happen before that.
- Existing watcher pattern on primary boxes: :293-307 (`child-added` on
  Main.panel._leftBox/_centerBox/_rightBox).

## Panel (src/panel.js)
- `isStandalone`, `isPrimary = !isStandalone || (stockgs-keep-top-panel && monitor ==
  panelManager.dtpPrimaryMonitor)` :99-106.
- Secondary: `this.panel = new SecondaryPanel(...)`, `this.statusArea = this.panel.statusArea
  = {}`, borrows Main.panel addToStatusArea/_addToPanelBox/_onMenuSet (119-133), own
  `_leftBox/_centerBox/_rightBox` (137-145), own `PopupMenuManager` (147-148).
  `_setPanelMenu` (690-696) builds quickSettings (constructor from
  `Utils.getSystemMenuInfo`, utils.js:246-251), dateMenu (`DateMenu.DateMenuButton`),
  activities, inserted at index 0 of `this.panel`. `_removePanelMenu` (698-717) never
  destroys them (PERSISTENTSTORAGE cache).
- `_setAllocationMap()` :891-914 maps element ids → actors: LEFT_BOX→_leftBox,
  CENTER_BOX→_centerBox, RIGHT_BOX→_rightBox, DATE_MENU→statusArea.dateMenu.container,
  SYSTEM_MENU→statusArea.quickSettings.container, ...
- `updateElementPositions()` 556-566 → `_updateGroupedElements` 568-631 → `vfunc_allocate`
  920-~1128. Vertical: `child-added` on _centerBox/_rightBox → `_onBoxActorAdded` →
  `_setVertical` (361-370, 1314-1374); `_leftBox` not hooked. `checkIfVertical()` exists.
- Panel.disable() else-branch (standalone) 510-514.

## Idioms
- `InjectionManager` (resource:///org/gnome/shell/extensions/extension.js)
  `.overrideMethod(proto, name, orig => function(...) {...})`, `.clear()`.
- `Utils.GlobalSignalsHandler` (utils.js:99-124) `.add([obj, 'sig'|['a','b'], cb])`,
  `.addWithLabel/.removeWithLabel`, `.destroy()`; `Utils.TimeoutsHandler` (152-186)
  `.add([name, ms, fn])`, `.remove(name)`; `Utils.InjectionsHandler` (130-147).
- Module state exported from src/extension.js (`SETTINGS`, `DTP_EXTENSION`, ...).
- Version checks upstream use `Config.PACKAGE_VERSION >= '50'` string compares; Omnibar
  uses compat.IS_51.
