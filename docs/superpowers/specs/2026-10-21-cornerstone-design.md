# Cornerstone: design

Status: draft, name approved by Etienne 2026-10-21
Date: 2026-10-21
Supersedes: `2026-10-21-omnibar-design.md` (the fork approach)

## Intent

Omnibar forked dash-to-panel to add tray mirroring and an Action Center.
Almost all of the fork is dash-to-panel code we do not want to maintain:
`src/actionCenter/` and `src/mirror/` are about 5,300 lines, the rest of
`src/` (about 16,900 lines) is stock dash-to-panel.

Cornerstone keeps only our part and runs as a companion to stock
dash-to-panel. It replaces GNOME's date menu (calendar and notifications)
and system menu (quick settings) with a single bar button that opens one
Action Center popup, and mirrors the tray icons onto every monitor's bar.

Success: with stock dash-to-panel and Cornerstone enabled, every bar shows
one Cornerstone button where the clock and the system indicators used to
be, clicking it opens the Action Center on that monitor, and every bar
shows the same tray icons as the primary bar.

## Goals

1. Companion, not fork. Everything dash-to-panel already does (taskbar,
   panels on every monitor, positions, styling, intellihide) stays in
   dash-to-panel. Cornerstone contains no dash-to-panel code.
2. One button. The date menu and the system menu become one button per
   bar. By default it shows the system indicators then the clock, as
   GNOME shows them today. Everything in it is customizable (see
   Customization).
3. Action Center layout:

   ```
   ┌─────────────────────────────────────────────┐
   │  Quick settings (full width)                │
   ├──────────────────────┬──────────────────────┤
   │  Media controls      │  Calendar            │
   │  Notifications       │  Events, world       │
   │  (scrolls, grows)    │  clocks, weather     │
   └──────────────────────┴──────────────────────┘
   ```

   GNOME's own widgets are moved into the popup, not reimplemented (as in
   Omnibar). The popup width is a setting.
4. Tray mirroring: secondary bars show live mirrors of the primary bar's
   status-area indicators, menus open on the monitor clicked, per-monitor
   and per-indicator switches (as in Omnibar).
5. Tray organization, per monitor: on each monitor's bar the user sets
   the order of the tray icons (AppIndicator and other extension
   indicators; the system indicators live in the one button) and, for
   each icon, one of: shown, in the overflow, or hidden.
   - Shown: on the bar, in the box (left, centre, right) and position
     chosen for that monitor.
   - Overflow: behind a chevron button on that bar, Windows style; the
     chevron opens a small popup with the overflowed icons, each still
     clickable, its menu opening on that monitor. The chevron only
     appears when the bar has at least one overflowed icon.
   - Hidden: not on that bar at all.
   In the preferences, one list per monitor where each icon is moved up
   and down (drag and drop where GTK allows) and given its state. New
   icons get a default state (proposed: shown, at the end). This
   replaces Omnibar's per-monitor, per-indicator mirror switches. On the
   primary bar, reordering moves the real indicator containers within
   GNOME's panel boxes and puts them back on disable (same restore rules
   as the Action Center's widget mover); on other bars it orders the
   mirrors.
6. Works on the stock GNOME top bar without dash-to-panel. The panel list
   is then `[Main.panel]`; the Action Center works, mirroring has nothing
   to do.
7. Supported shells: GNOME 50 and 51. Supported dash-to-panel: v74 and
   later.

## Customization

Etienne's brief: "super customizable, but easy to use and instinctive to
use". Every option below has a default that looks like stock GNOME, so
Cornerstone is right out of the box and customizing is optional.

### The button

- System indicators: each one (network, VPN, Bluetooth, volume,
  microphone, battery, power, do not disturb, notification count, and
  the indicators other extensions add to quick settings) can be shown or
  hidden, and the user sets their order. Battery has a "show
  percentage" switch.
- Clock and date:
  - Format: presets ("14:32", "2:32 PM", "Wed 14:32", "Wed 21 Oct
    14:32", date on a second line) plus a custom format field
    (GLib `strftime`-style, with a cheat sheet next to it). Seconds and
    the week number are switches.
  - Font: family, size and weight (GTK font dialog), and a separate
    size for the date line when it is on two lines.
  - Clock and date are elements of the order like the indicators, so the
    clock can sit before, after or between them.
- Spacing between the elements and the button's padding.
- Per monitor: the button uses the same settings on every bar; a
  monitor can override them ("Customize for this monitor"), matching the
  per-monitor tray.

### The Action Center

- Width: a slider with a live readout, and "Auto" (fits its content).
- Which sections are shown: quick settings, media, notifications,
  calendar, events, world clocks, weather.
- Column sides: notifications left and calendar right by default, can be
  swapped.

### The tray

Per monitor, as in goal 5: order, box, and shown / overflow / hidden.

### Making it easy

- Live preview: the preferences show a preview of the button as it will
  look, updated while typing a clock format or dragging an indicator;
  changes also apply live on the bars.
- Order is set by dragging, everywhere (button elements, tray icons),
  with move up / down buttons as the keyboard-accessible fallback.
- Simple first: each page opens with the common choices (presets,
  switches); the custom format field, fonts and spacing sit in an
  expandable "More options" row.
- A reset button on each group restores GNOME's look.
- Monitors are named the way GNOME Settings names them (connector and
  model), with the primary marked, so per-monitor pages are easy to
  match to screens.

## Non-goals

- GNOME versions below 50.
- Anything dash-to-panel already provides.
- Rebuilding GNOME's quick settings, notifications or calendar.
- X11 sessions as a target.

## Anti-goals (failure even if it "works")

Carried over from Omnibar:

- Breaking Etienne's live session. All development testing runs in the
  nested shell (`tests/nested`).
- Leaking state on disable: GNOME's panel, date menu and quick settings,
  and dash-to-panel's bars, behave exactly as before enable.
- Mirrors that steal, reparent or resize the real indicator.
- Silently swallowed errors.

New:

- Patching dash-to-panel's code or prototypes. Cornerstone only uses what
  dash-to-panel exposes (`global.dashToPanel`) and the actors it creates.
- Breaking when dash-to-panel is enabled after Cornerstone, rebuilds its
  panels (it does so on many settings changes), or is disabled underneath
  it.

## Integration with dash-to-panel

- Panel discovery: `global.dashToPanel.panels`, refreshed on
  `panels-created`. Without `global.dashToPanel`, use `[Main.panel]`.
  Watch `Main.extensionManager` for dash-to-panel being enabled or
  disabled after us.
- The one button: dash-to-panel positions the date menu and the system
  menu by their container actors (`panel.js`, element position map).
  Cornerstone puts its button content inside each panel's `dateMenu`
  container and hides the `quickSettings` container, so dash-to-panel
  keeps positioning "the date menu slot" and nothing in it is patched.
  This replaces Omnibar's `_omniSystemMenu` hook (`panel.js:908`).
- Secondary bars: dash-to-panel gives them their own `DateMenuButton` and
  `QuickSettings`. They get the same treatment; the Action Center is
  shared and always holds the primary's widgets (decision carried over
  from Omnibar).

## Decisions taken

Proposed in chat and approved by Etienne (2026-10-21):

- Stop forking dash-to-panel; make a companion extension.
- Name: **Cornerstone**, slug `cornerstone`.
- One button replacing the date menu and the system menu, configurable
  content, compatible with dash-to-panel.
- Layout: quick settings on top, notifications left, calendar right.
- Tray mirroring in Cornerstone or as a separate extension (see open
  questions).
- The tray icons can be organized per monitor: order, and shown,
  overflow (Windows-style chevron) or hidden, all per monitor.
- Rename the repository to Cornerstone; Omnibar was its working name.
- Mirroring stays in Cornerstone: one extension, with the Action Center
  and tray mirroring switchable independently.
- Button default: system indicators then the clock, as GNOME shows them.
  The indicators, their order, the clock format and its font are
  customizable.
- The Action Center width is a setting.
- "Super customizable, but easy to use and instinctive to use": see
  Customization.

## Calls made by Claude (Etienne to confirm while reading)

- Work happens on branch `cornerstone` of this repo, so history, notes
  and the nested test harness are kept. The dash-to-panel code is
  deleted there; `main` stays the Omnibar fork until Cornerstone replaces
  it.
- Identity: UUID `cornerstone@etienne-gn.github.io`, schema
  `org.gnome.shell.extensions.cornerstone`, already set with
  `tools/rename.sh`; the repository is `Etienne-GN/cornerstone`.
- Settings start from defaults; no migration from Omnibar.
- Shortcuts carried over: Super+V / Super+M / Super+S open the Action
  Center on the monitor under the pointer; clicking a banner opens it or
  activates the notification (setting).
- Customization details beyond the brief are proposals: the clock
  presets, the per-monitor override of the button, the section switches
  and column swap in the Action Center, "More options" rows, live
  preview and reset buttons.
- Licence stays GPL-2.0-or-later; MMB and spin83 credits stay with the
  mirroring code. dash-to-panel credits go once none of its code remains.

## Open questions

None at the moment; the calls above stand unless Etienne changes them.

## First step

A spike, before deleting anything: in the nested shell with stock
dash-to-panel v74, put a test actor inside the `dateMenu` container and
hide the `quickSettings` container on every panel, then change
dash-to-panel settings that rebuild its panels, and disable and re-enable
it. The approach holds if the actor stays in place, comes back after a
rebuild, and disable restores both containers.

Result (2026-10-21, GNOME 51.1, dash-to-panel v74, two monitors): the
approach holds. `tests/nested/scenarios/spike-slot.js` passes; captures
in `.nested/spike-slot/`. Findings for the real implementation:

- dash-to-panel reuses date menu and quick settings buttons across
  rebuilds (`PERSISTENTSTORAGE` in its `panel.js`), so the same
  containers come back on new panels. Track state per container, not
  per panel; two containers served every rebuild in the spike.
- The `dateMenu` container is a `St.Bin`: `set_child()` with our button
  and back with the original restores cleanly.
- dash-to-panel shows the quick settings container again when it
  rebuilds; hiding it once is not enough, keep it hidden on
  `notify::visible`.
- With dash-to-panel disabled, the primary containers return to
  `Main.panel` with our changes intact, so the stock top bar works with
  no extra code.
- `global.dashToPanel` is a new object after dash-to-panel is disabled
  and enabled again; follow `extension-state-changed` and reconnect
  `panels-created`.

