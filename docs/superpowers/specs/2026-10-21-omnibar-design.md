# Omnibar: design

Status: approved by Etienne 2026-10-21 ("Omnibar" is a temporary name)
Date: 2026-10-21

## Intent

Etienne wants a Windows-like desktop on GNOME with several monitors. Today
he runs dash-to-panel with the bar at the bottom. Two things are missing:

- Extension tray icons (appindicator, system-monitor, Vitals, ArcMenu, ...)
  appear only on the primary monitor's bar. dash-to-panel gives secondary
  bars an empty status area (`panel.js:116-118` in v74,
  `this.statusArea = this.panel.statusArea = {}`).
- The notification list, quick settings and calendar live in separate
  GNOME popups. He wants them grouped in one window.

Multi Monitor Bar (MMB) solves the first problem but lacks dash-to-panel's
level of customization. Omnibar is a fork of dash-to-panel that adds MMB's
indicator mirroring and a unified "Action Center" popup.

Success: on every monitor, the bar sits where he configured it, shows the
same tray icons as the primary bar (each one clickable, menu opening on
the monitor clicked), and clicking the clock opens one Action Center
popup on that monitor.

## Goals

1. Keep everything dash-to-panel does today: per-monitor position, size,
   element order, styling, taskbar behaviour, settings window.
2. Tray icons on every monitor: secondary bars show live mirrors of the
   primary bar's status-area indicators.
   - A click on a mirror opens the real indicator's menu, positioned on
     the monitor and bar that was clicked.
   - The mirror tracks the source live (icon change, label text such as
     system-monitor/Vitals readings, visibility).
   - Per-monitor setting choosing which indicators are mirrored
     (default: all).
3. Action Center: one popup holding quick settings, notifications and
   calendar.
   - Opened by clicking the clock (`dateMenu` element) on any bar; anchors
     to that bar's corner on that monitor.
   - Layout top to bottom: quick settings grid, notification list,
     calendar.
   - Reuses GNOME's own widgets (quick settings grid, message list,
     calendar) moved into the new popup, not reimplemented.
   - When disabled in settings, GNOME's stock separate popups are restored
     unchanged.
4. Supported shells: GNOME 50 (Debian workstation, currently 50.5) and
   GNOME 51 (Arch at home).

## Non-goals

- GNOME versions below 50.
- Publishing to extensions.gnome.org (personal use for now; keep the code
  clean enough that it stays possible later).
- Redesigning dash-to-panel's settings window beyond adding the new
  options.
- Rebuilding GNOME's quick settings or notifications from scratch.
- X11 sessions as a target (both machines run Wayland; don't break X11
  deliberately, but don't test it).

## Anti-goals (failure even if it "works")

- Breaking Etienne's live session: shell crash loops, a login that comes
  up without a bar, lost settings. All development testing runs in a
  nested shell (`gnome-shell --devkit`, `/usr/libexec/mutter-devkit` is
  installed), never in the live session.
- Leaking state on disable: after `gnome-extensions disable`, the stock
  GNOME panel, date menu and quick settings must behave exactly as before
  enable. Every reparented actor goes back to its original parent and
  position; every signal and patch is undone.
- Mirrors that break the source: a mirror must never steal, reparent or
  resize the real indicator in a way the primary bar can see.
- Silently swallowed errors: errors are logged (`console.error` with
  context), not caught and ignored.
- Clashing with stock dash-to-panel: Omnibar has its own UUID, its own
  GSettings schema id and path, so both can be installed (only one
  enabled at a time).

## Constraints

- License: dash-to-panel is GPL-2.0-or-later, MMB is GPL-2.0-or-later.
  Omnibar is GPL-2.0-or-later; keep upstream copyright headers and credit
  MMB (and spin83's Multi Monitors Add-On it derives from) for any
  adapted code.
- Upstream sources:
  - dash-to-panel: https://github.com/home-sweet-gnome/dash-to-panel
    (installed v74 already declares shell-version 46-51).
  - MMB: https://github.com/FrederykAbryan/multi-monitors-bar_fapv2
    (installed v56 declares 45-50; anything taken from it must be
    verified on 51).
- Etienne's desktop is his workstation: builds and tests run at nice 19.
- Small commits, one concern each; commit messages max 80 characters per
  line, no emoji, Co-Authored-By trailer only.

## Decisions taken

These were proposed in chat and approved by Etienne:

- Fork dash-to-panel; bring MMB's mirroring in as a separate module, not
  a merge of the two codebases.
- Implement in order: fork and rename, then tray mirroring, then Action
  Center. Each step ends with a working, installable build.
- Mirroring technique follows MMB: live `Clutter.Clone` of the source
  indicator with input forwarded to the real button
  (MMB `mirroredIndicatorButton.js`, `statusIndicatorsController.js`,
  `monitorIndicatorPolicy.js`).

Answered by Etienne after the builder check (2026-10-21):

- **One shared Action Center.** Extensions add their quick-settings
  toggles only to `Main.panel.statusArea.quickSettings`; dash-to-panel's
  per-panel `QuickSettings`/`DateMenuButton` on secondary bars
  (`panel.js:152-157`, `_getPanelMenu`) lack them. The primary's widgets
  are the single source: clicking the clock on any bar opens the
  Action Center on that monitor with the full contents. Secondary bars'
  own quick-settings and date-menu popups are no longer used while the
  Action Center is enabled (restored when it is disabled).
- **Add-on compatibility.** Omnibar exposes the same `global.dashToPanel`
  object dash-to-panel provides, so date-menu-formatter keeps working on
  every bar. ArcMenu checks dash-to-panel's UUID and schema
  (`constants.js:4`, `menuButton.js:194,960`), so it is not expected to
  integrate; it is mirrored like any other indicator.
- **Action Center contents.** Everything the stock date menu holds is
  kept. Top: quick settings grid. Middle: media (MPRIS) controls and
  notification list. Bottom: calendar with events, world clocks and
  weather.
- **GNOME 51 testing.** The builder tests on GNOME 50 (this
  workstation). Each step ends with a short manual checklist Etienne
  runs on GNOME 51 at home; a step is not done until it passes there.

## Calls made by Claude (Etienne to confirm while reading)

- Mirroring covers all three panel boxes (left, centre, right). A mirror
  is placed in the same box as its source on each secondary bar, so
  indicators the user placed left or centre (Vitals, ArcMenu) appear on
  every monitor.
- With the Action Center enabled, the quick-settings (system menu)
  button on every bar opens the Action Center; GNOME's stock popup would
  be empty once its grid is moved.
- GNOME's toggle-message-tray and toggle-quick-settings shortcuts, and
  clicking a notification banner, open the Action Center on the monitor
  under the pointer.
- Omnibar replaces both dash-to-panel and MMB; both must be disabled when
  Omnibar is enabled, since MMB would also build bars on secondary
  monitors. Switching over is done by Etienne; the builder documents the
  exact commands.

- Name: **Omnibar**, UUID `omnibar@etienne-gn.github.io` (matches his
  existing `holo@etienne-gn.github.io`), schema
  `org.gnome.shell.extensions.omnibar`. The name is temporary and will
  change: keep UUID, schema id/path, gettext domain and display name
  derived from as few places as possible, and document the rename steps.
- Repository: new local git repo at `~/git/omnibar`, forked from the
  upstream dash-to-panel git history (not from the installed zip) so
  upstream fixes can be merged later. No remote is created or pushed;
  Etienne decides where it is hosted.
- Settings: dash-to-panel's existing settings migrate by nothing; Omnibar
  starts from defaults. An optional one-shot "import from dash-to-panel"
  is left to the builder (nice-to-have, not required).
- The taskbar, date menu and system menu buttons already exist per-panel
  in dash-to-panel and are not mirrored.
- Action Center anchoring: the popup opens next to the bar edge the bar
  is on (bottom bar opens upward, right-aligned to the clock).

## Left to the builder

- Internal module layout, class names, settings key names.
- How GNOME 50 vs 51 API differences are handled (feature detection
  preferred over version checks).
- Whether the Action Center reparents the existing date-menu and
  quick-settings children or wraps them; whichever restores cleanly.
- Test approach inside the nested shell (scripted checks via
  `gnome-extensions` and `journalctl --user`, plus a manual checklist).
