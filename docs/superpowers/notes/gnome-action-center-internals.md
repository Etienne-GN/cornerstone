# Action Center — GNOME Shell internals (verified against 50.5 tag, js/ui/; 51.1 diffs noted)
# Sources: /home/etienne/claude/ref/gnome-shell-50, /home/etienne/claude/ref/gnome-shell-51

## dateMenu.js (50) — DateMenuButton :860 (PanelMenu.Button)
- Button: `_clockDisplay`, `_indicator` (MessagesIndicator :869) in clock-display-box (865-887).
- Menu: `this.menu.box` (.datemenu-popover) → `bin` (FreezableBinLayout, `bin._delegate = this` :892)
  → `hbox` (calendarArea :896):
  - column 1: `this._messageList = new Calendar.CalendarMessageList()` (:918) — notifications AND
    MPRIS media together (no separate media section in 50).
  - column 2: `vbox` (.datemenu-calendar-column, CalendarColumnLayout([_calendar, _date]) :934):
    `_date` (TodayButton :905), `_calendar` (:899), `_displaysSection` (ScrollView :951) holding
    `_eventsItem` (:960), `_clocksItem` (:963), `_weatherItem` (:966).
  - CalendarColumnLayout only measures children still parented (:850) → degrades if moved.
- `_calendar` 'selected-date-changed' → `layout.frozen = !today` on bin + `_eventsItem.setDate()` (900-904).
- `this.menu` 'open-state-changed' (open) resets `_calendar`, `_date`, `_eventsItem` to today (907-915) →
  replicate in the new popup.
- 50 only: `this.menu.actor.connectObject('captured-event::button|touch|key', …)` →
  `_messageList.maybeCollapseMessageGroupForEvent(event)` (922-931) → replicate on new actor.
- 51: block replaced by `this._messageList.setCaptureContainer(this.menu.actor)`; calendar.js
  `CalendarMessageList.setCaptureContainer(container)` adds CAPTURE ClickGesture/KeyController
  (`calendar-close-expanded-group-click|key`); `maybeCollapseMessageGroupForEvent` removed. 51 also
  `menu.actor.set_keynav_flags(St.KeynavFlags.NONE)`.
- `_sessionUpdated()` (999-1015) toggles `_displaysSection.visible`, `_messageList.visible` on
  sessionMode 'updated' — moved widgets still toggled.
- Main.panel.toggleCalendar() → `_toggleMenu(statusArea.dateMenu)` (panel.js:603); closeCalendar (611);
  `_toggleMenu/_closeMenu` (580-601) no-op unless indicator mapped && reactive.
- closeCalendar() call sites: dateMenu.js 302/381/601, messageList.js 817 (MediaMessage click),
  notificationDaemon.js 387/473/547, network.js 2035, screenshot.js 2180/2422, extensionSystem.js 808, main.js 860.
- Banner blocking: panel.js 731-751 `_onMenuSet` sets `Main.messageTray.bannerBlocked = isOpen` for
  menus aligned with bannerAlignment → new popup must set bannerBlocked itself.

## Message list
- CalendarMessageList (calendar.js:794): `_placeholder`, `_scrollView` → `_messageView =
  new MessageList.MessageView()` (:814), `_clearButton` (823-837).
- MessageView (messageList.js:1480): `_mediaSource = new Mpris.MprisSource()` (:1506), media first;
  notifications from Main.messageTray source-added/removed (:1807).
- No parent/dateMenu references; uses Main.messageTray, Main.sessionMode. Clicks call
  Main.panel.closeCalendar() (MediaMessage 812-818; notification handlers via activate()).

## Quick settings
- QuickSettings (panel.js:286), statusArea.quickSettings: `_indicators`, `this.menu = new
  QuickSettingsMenu(this, N_QUICK_SETTINGS_COLUMNS)` (:296), async `_setupIndicators()` (298, 302-395)
  → `_addItemsBefore` (:397) → `menu.insertItemBefore`; `addExternalIndicator(indicator, colSpan)` (408-416).
- QuickSettingsMenu (quickSettings.js:731, PopupMenu.PopupMenu): `this.actor` 0×0 St.Widget holding
  `_boxPointer` (:735); `this.box` .quick-settings (:750); `_grid` (.quick-settings-grid,
  QuickSettingsLayout(placeholder,{nColumns}) 765-772; first child placeholder whose HEIGHT is bound to
  `_overlay`); `_overlay` (Clutter.Actor :753) is a child of `menu.actor` (:811), holds every toggle
  submenu actor (`_completeAddItem` 824-836), positioned by X/Y BindConstraints on `_boxPointer` with
  offset from `_grid.apply_relative_transform_to_point(_boxPointer)` (774-809). `_dimEffect` on
  `_boxPointer` (746-749, `_setDimmed`), `_activeMenu` (close() :848). 'menu-closed' hides actor (:741),
  'system-modal-opened' closes (:743).
- QuickToggleMenu (hasMenu) has own PopupMenuManager (33-39) → Main.pushModal(submenu.actor), closes
  on outside click (popupMenu.js:1434ff); binds Y to sourceActor (371-377).
- Hard refs: Main.panel.closeQuickSettings() (popupMenu.js:722, status/system.js 57/153/185/190/195/202/207,
  status/backgroundApps.js:100); `Main.panel.statusArea.quickSettings.menu.close(...)` (status/system.js:122).

## Keybindings
- windowManager.js 747-759 (schema org.gnome.shell.keybindings): toggle-message-tray →
  `_toggleCalendar` → Main.panel.toggleCalendar() (1741-1742); toggle-quick-settings →
  Main.panel.toggleQuickSettings() (1745-1746). Defaults: <Super>v, <Super>m; <Super>s.
- Override Main.panel.toggleCalendar/toggleQuickSettings/closeCalendar/closeQuickSettings (looked up at
  call time). Patching Main.wm._toggleCalendar has no effect (pre-bound).
- Banner click (50): banner = new MessageList.NotificationMessage (messageTray.js:1135); click →
  notification.activate() (messageList.js:744) — does NOT open the date menu. Hook needed
  (e.g. Main.messageTray._bannerBin :731, private).

## 50 → 51 API changes relevant here
- popupMenu open/close(params={animate,...}) return bool (compat.menuOpen/menuClose exist, IS_51).
- PopupMenuManager uses CAPTURE KeyController/ClickGesture/MotionController (no _onCapturedEvent).
- `PopupMenuBase.actor` setter auto-destroys menu when actor destroyed (51).
- QuickSettingsMenu.open override removed; close(params) returns bool.
- panelMenu.Button uses _keyController; vfunc_hide calls menu.close({animate:false}).
- Unchanged: addExternalIndicator, _addItemsBefore, _grid, _overlay, insertItemBefore, panel toggle/close API,
  keybinding names.
