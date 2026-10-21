# MMB mirroring — research notes (MMB HEAD 37fcd29, /home/etienne/claude/ref/mmb)

Upstream MMB already declares GNOME 45-51 (commit 714ac13 "Add GNOME 51 support").

## Files
- mirroredIndicatorButton.js (3390 lines): `MirroredIndicatorButton` (PanelMenu.Button
  subclass, :98) + `MMWorkspacePreviewLayout` (:37). Imports astraSourceGeometry.js (:18),
  `sourceIsVisible` from monitorIndicatorPolicy.js (:19), `setBoxVertical`, `shellVersion`
  from common.js (:29). Expects `panel._vertical`, `panel.monitorIndex`,
  `panel.menuManager` (:175, :489, :524, :775, :3296); host calls
  `_syncPanelOrientation(vertical)` (mmpanel.js:819).
- verticalRemap.js (200): `remapClone(clone, vertical)`; uses `verticalBoxProps` from
  common.js; looks for CSS class `mm-astra-monitor` (:107).
- astraSourceGeometry.js (73, pure): `retainAstraSourceHeight(source, panelBox,
  fallbackHeight)`; caller passes `Main.layoutManager.panelBox` (mirroredIndicatorButton.js:913).
- statusIndicatorsController.js is the OLD "transfer" feature — not mirroring; do not port.
- Orchestration (re-implemented by Task 6, not Task 5) lives in mmpanel.js
  `MultiMonitorsPanel`: `_ensureIndicator` :1084-1121, `_cloneAllMainPanelIndicators`
  :1385-1503, `_updateBox` :1548-1576, `_ensureQuickSettingsRightmost` :1586-1613,
  watchers :541, :568-628.

## Mechanism
- `_init(panel, role)`: `super._init(0.0, null, true)` (dontCreateMenu; GNOME 50
  ClickGesture would swallow clicks, :101-105). activities → `_initActivitiesButton`;
  others → `_initGenericIndicator(role)` (:207): source = `Main.panel.statusArea[role]`,
  source `destroy` → `this.destroy()` (:212-217), empty detection `_markEmpty` (:248),
  `_createIndicatorClone`, `_setupSourcePresenceWatchers` (:256-288), `_syncMirrorPresence` (:290).
- Clones `source.get_first_child()`. `_createIndicatorClone` (:333-428) dispatch:
  astra → `_createAstraMultiComponentClone` (:978); quickSettings →
  `_createQuickSettingsClone` (:1329); workspace-indicator → `_createWorkspaceIndicatorMirror`
  (:430); dateMenu (:380-397, unreached in MMB); favorites → `_createFillClone` (:1949);
  generic → `_createSimpleClone` (:856) with `problematicExtensions` substring list
  (:871-882: tiling, tilingshell, forge, pop-shell, system-monitor, vitals, tophat,
  appindicator, ubuntu-appindicator, kstatusnotifier, tray, arcmenu, arc-menu, 'arc',
  clipboard, clipman) → `_createStaticIconCopy` (:1479, St.Icon copies + label
  `bind_property('text')`, `_createLabelCopy` :1711) else `_createAllocationMatchedClone` (:911-976).
- Static copies refresh by a 5 s signature poll (`_startIconSync` :1889,
  `_mirrorSourceSignature` :1919).
- Input: `vfunc_button_press_event`/`vfunc_event` → `_onButtonPress` (:2004-2102):
  activities, workspace-indicator, clipboard (`_openClipboardIndicatorMenu` :2551),
  quickSettings (`_openQuickSettingsMenu` :2114), `.menu` (`_openMirroredMenu` :2851),
  ArcMenu (`_openArcMenu` :2456), custom popups (`_openCustomPopupMenu` :2685),
  fallback `_forwardClickToSource` (:2427).
- Menu repositioning to clicked monitor: `_openMirroredMenu` saves sourceActor,
  `_preventMainPanelActiveState` (:2974), anchors to mirror;
  `_updateMenuPositioningNative` (:3082) / `_updateMenuPositioning` (:2994-3072);
  250 ms deferred restore after close. Quick settings first-open priming
  `_primeQuickSettingsMenuThenOpen` (:2259-2339).
- 51-sensitive: :2274 menu open/close `{animate:false}` vs PopupAnimation.NONE;
  common.js:25-36 vertical; :744 `orientation` without helper; child-added vs
  actor-added probed with `GObject.signal_lookup`.
- Cleanup `_cleanup()` (:3161-3384), idempotent (actor-lifecycle test).
- Dead code: `_applyNormalMode`, `_applyOverviewMode`, `_detectAndLockWidth`,
  `_onSourceWidthChanged`/`_monitorSize`, `_isPrimaryMonitorFullscreen`,
  `_createClockDisplay`; fields `_lockSizeTimeoutId`, `_sizeDebounceId`,
  `_overviewShowingId` only cleaned, never set.
- GUIDELINES.md: track/remove all GLib sources; no try/catch around disconnect; no
  `_isDestroyed` flags; comment duck-typing of third-party extensions.

## Tests (tests/*.mjs, plain node ESM)
- actor-lifecycle.mjs (cleanup idempotency, `_copyIconsFromSource` x20, issue #40),
  vertical-remap.mjs, astra-fullscreen-size.mjs (node:test). Method extraction by text
  relies on 8-space indent `'        name('`.
