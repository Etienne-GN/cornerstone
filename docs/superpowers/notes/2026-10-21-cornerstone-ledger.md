# Cornerstone ledger — plan: docs/superpowers/plans/2026-10-21-cornerstone.md

Spec: docs/superpowers/specs/2026-10-21-cornerstone-design.md
Repo: ~/projects/cornerstone, branch `cornerstone` (pushed to
github.com/Etienne-GN/cornerstone). `main` is still the Omnibar fork.

## Environment

- This machine: CachyOS, GNOME Shell 51.1, mutter 51.0 built without
  devkit, Dash to Panel v74 installed (read only, copied into nested runs).
- The live session was never touched: all runs went through
  `tests/nested/run.sh`, headless, private buses and directories.
- No prettier or eslint here (no node_modules); code follows the existing
  style by hand.

## Done

- Phase 1: Dash to Panel purged (70k lines). `PanelSource` follows Dash to
  Panel (rebuilds, disable/enable replacing `global.dashToPanel`); `Slots`
  takes button containers by swapping their child.
- Phase 2: one button per bar (clones of GNOME's quick settings
  indicators + own clock), system menu slot kept hidden.
- Phase 3: Action Center in two columns under quick settings; width,
  swap, hideable sections.
- Phase 4: tray layout per monitor (order, box, shown/overflow/hidden);
  overflow chevron with a popup of mirrors; top bar icons rearranged for
  real and restored on disable.
- Phase 5: preferences rebuilt in code (Button with live preview,
  Action Center, Tray, About); the real window opens in the nested shell.
- Phase 6: full nested sweep green (list below); zip packs every module
  (Python fallback where `zip` is missing); GNOME 50/51 checklist written.

## Final nested sweep (2026-10-21)

PASS: smoke (with and without Dash to Panel), mirrors (also vertical),
actionCenter, disable-fault, button (with, without, vertical), acLayout,
tray, prefs, static-copy (clipboard-history), spike-slot. 115 unit tests.

## Known gaps

- `routing` fails on headless 51: virtual pointer motion does not move the
  pointer, so the per-monitor shortcut routing is not covered there. It
  failed before the purge too.
- `teardown` needs the AppIndicator extension, not installed here.
- Not built yet: per-monitor override of the button's settings; a
  dedicated "More options" row (custom clock format and codes show only
  for the Custom format); a grid overflow (it is a row: panel buttons have
  no height outside a bar, which Clutter.FlowLayout collapses).
- The overflow and tray on vertical bars were not captured; the button
  on a vertical bar was.
- The one button's clock on a side bar splits words and hours/minutes
  onto lines; a custom format's own line breaks are kept.
- No real-session run yet: see docs/testing/cornerstone-checklist.md.
