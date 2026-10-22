# Cornerstone Implementation Plan

Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Omnibar fork into Cornerstone, a companion to stock
dash-to-panel: one bar button replacing the date menu and system menu, the
Action Center (quick settings on top, notifications left, calendar right),
tray mirroring and per-monitor tray organization, all customizable and easy
to set up.

**Spec:** `docs/superpowers/specs/2026-10-21-cornerstone-design.md`.

**Architecture:** No dash-to-panel code remains. A `PanelSource` lists the
bars (dash-to-panel's `global.dashToPanel.panels`, else `Main.panel`) and
signals when they change. Every feature takes slots in those bars the way
the spike did: it swaps the child of a dash-to-panel container (`St.Bin`)
or adds actors to the panel boxes, tracks what it touched per container,
and puts everything back on disable. The Action Center, mirroring and the
one button are independent modules wired by `extension.js`.

**Tech stack:** GJS (ESM), GNOME Shell 50/51, St/Clutter, Adw/Gtk4 prefs,
GNU make, `node --test` unit tests, headless nested shell
(`tests/nested/run.sh`).

## Global constraints

- GNOME 50 and 51; dash-to-panel v74 and later, or none.
- Never touch the live session: integration tests only through
  `tests/nested/run.sh`; no `make install`, no `gnome-extensions` calls
  outside the harness. Heavy commands under `nice -n 19`.
- Never patch dash-to-panel code or prototypes; only
  `global.dashToPanel` and the actors it creates. Instance-level overrides
  of GNOME objects go through `InstanceOverrides` and are cleared on
  disable.
- Errors are logged (`console.error('[cornerstone] <context>', e)`), never
  swallowed. Teardown steps are isolated so one failure does not skip the
  rest.
- Prettier style (no semicolons, single quotes, 2 spaces); private fields
  put on GNOME objects use the `_cornerstone` prefix.
- Commits: one concern each, ≤ 80 columns, no emoji, Co-Authored-By
  trailer. Push the `cornerstone` branch after each phase.

## Phase 1: companion skeleton (purge dash-to-panel)

Ends with: stock dash-to-panel + Cornerstone give the same mirroring and
Action Center as Omnibar did; no dash-to-panel file left.

- [ ] 1.1 `src/panels.js`: `PanelSource`. Lists bars as adapters
  `{ monitorIndex, isPrimary, statusArea, boxes, menuManager, vertical,
  position, actor, dtp }` built from dash-to-panel panels or `Main.panel`.
  Follows `panels-created` and `extension-state-changed` (reconnecting
  when `global.dashToPanel` is replaced), emits `changed` after the bars
  settle. Unit tested with fakes.
- [ ] 1.2 `src/signals.js`: the two helpers the mirror uses from
  dash-to-panel's `utils.js` (labelled timeouts; signal groups), or
  replace them with `connectObject` and GLib sources directly.
- [ ] 1.3 Mirror controller on `PanelSource`: secondary bars only; the
  quick settings mirror takes the bar's `quickSettings` container by
  swapping its child (as the spike did), replacing the `panel.js` hook.
- [ ] 1.4 Router and Action Center on `PanelSource`: buttons, banner
  clicks, keyboard shortcuts, `_fitToSource` without dash-to-panel
  internals beyond the adapter.
- [ ] 1.5 New `extension.js` (`CornerstoneExtension`): settings,
  `PanelSource`, `MirrorController`, `ActionCenter`; isolated teardown;
  stale-enable guard kept.
- [ ] 1.6 Purge: delete every dash-to-panel module, UI file, image, media
  and translation; schema keeps only Cornerstone keys; Makefile packs
  `src/**`; metadata description/url/version; new minimal `prefs.js`
  (Adw window hosting the existing Action Center and mirror rows).
- [ ] 1.7 Tests: unit tests for removed modules go; lifecycle test
  rewritten for the new `extension.js`; nested scenarios run with
  `--with-extension dash-to-panel@jderose9.github.com` (run.sh `--dtp`
  shorthand) and also without it where meaningful.
- [ ] 1.8 Docs: README (companion, credits), SWITCHING.md (from Omnibar or
  dash-to-panel + MMB to dash-to-panel + Cornerstone), RENAMING.md.

## Phase 2: the one button

Ends with: every bar shows one Cornerstone button (system indicators then
clock) in the date menu slot; the system menu slot is hidden; clicking it
opens the Action Center on that monitor; disable restores both slots.

- [ ] 2.1 `src/button/slots.js`: `SlotSwap` from the spike, generalized:
  per-container tracking, keep-hidden containers, restore, follows
  `PanelSource`.
- [ ] 2.2 `src/button/clock.js`: own clock label from
  `GnomeDesktop.WallClock` (`notify::clock`), formatting with
  `GLib.DateTime.format()`; presets and custom format; second line for the
  date.
- [ ] 2.3 `src/button/indicators.js`: one `Clutter.Clone` per child of the
  primary quick settings indicator box, visibility bound to the source;
  order and per-item visibility from settings. Verify in the nested shell
  that clones paint while the source container is hidden; otherwise keep
  the source in an off-screen mapped holder.
- [ ] 2.4 `src/button/cornerstoneButton.js`: the bar button (PanelMenu
  styling, `:active` while the Action Center is open), click and keyboard
  open the Action Center for its monitor; vertical bars supported.
- [ ] 2.5 Wiring: setting `one-button` (default on, needs the Action
  Center); router sources prefer the button; the mirror controller skips
  its quick settings mirror while the button owns the slot.
- [ ] 2.6 Nested scenario `button`: two monitors, with and without
  dash-to-panel, rebuild, disable/enable dash-to-panel, Cornerstone
  disable restores; stage captures.

## Phase 3: Action Center layout

- [ ] 3.1 Two columns under a full-width quick settings row:
  notifications (and media) left, calendar right; `action-center-swap`
  swaps the sides.
- [ ] 3.2 `action-center-width` (0 = auto, else px) applied on open and on
  change.
- [ ] 3.3 Section switches: media, notifications, calendar, events, world
  clocks, weather (hide the hosted GNOME widgets; restore on disable).
- [ ] 3.4 Update `acLayout` for the new layout and the GNOME 51 height
  behaviour; captures.

## Phase 4: tray organization

- [ ] 4.1 Settings model `tray-layout` (JSON per monitor key: ordered
  roles with `box` and `state` = shown | overflow | hidden) with pure
  helpers (read, defaults for new roles, move, set state); unit tested.
  Migrates `mirror-indicator-visibility` once.
- [ ] 4.2 Primary bar: order and hide real indicators within GNOME's
  boxes via `WidgetMover`, restored on disable.
- [ ] 4.3 Secondary bars: mirrors placed by the same model.
- [ ] 4.4 Overflow: a chevron button per bar holding the overflowed
  icons (real ones on the primary, mirrors elsewhere) in a small popup;
  menus open on that monitor; hidden when empty.
- [ ] 4.5 Nested scenario `tray`.

## Phase 5: preferences

- [ ] 5.1 Window pages: Button, Action Center, Tray, About.
- [ ] 5.2 Button page: live preview, draggable element list (indicators,
  clock, date) with show switches and up/down buttons, clock presets,
  "More options" (custom format with cheat sheet, fonts, spacing),
  per-monitor override, reset.
- [ ] 5.3 Action Center page: enable, width slider with Auto, sections,
  swap, banner click, reset.
- [ ] 5.4 Tray page: monitor selector named like GNOME Settings, draggable
  list with state (Shown / Overflow / Hidden) and box, reset.
- [ ] 5.5 The shell publishes what prefs need (monitors, indicator roles
  and labels, quick settings items) through the catalog setting.

## Phase 6: wrap-up

- [ ] 6.1 Full nested run on two monitors, vertical bar, with and without
  dash-to-panel; unit tests; lint.
- [ ] 6.2 GNOME 50 checklist for Etienne's workstation.
- [ ] 6.3 Ledger of what was done and what is left.
