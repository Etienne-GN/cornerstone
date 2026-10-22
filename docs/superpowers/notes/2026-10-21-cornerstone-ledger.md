# Cornerstone ledger — plan: docs/superpowers/plans/2026-10-21-cornerstone.md

Spec: docs/superpowers/specs/2026-10-21-cornerstone-design.md
Repo: ~/projects/cornerstone, branch `cornerstone` (pushed to
github.com/Etienne-GN/cornerstone). `main` was fast-forwarded to it on 2026-10-22.

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

## Follow-ups (2026-10-22)

- Per-monitor button settings (`button-monitor-overrides`, `ButtonConfig`,
  Monitors group on the Button page).
- Tray overflow as a grid of square cells; `tray-overflow-columns`
  (1–8, default 4) on the Tray page.
- More options group on the Button page: clock format field (always
  shown, starting from the current format), format codes, and
  `button-spacing`, overridable per monitor.
- `routing` passes on headless 51: a new virtual device drops its first
  events (motion is resent until the pointer arrives), and the pointer
  started in the hot corner, which opened the overview (hot corners are
  off in the nested shell now).
- `teardown` passes with AppIndicator fetched into `.nested/extensions`
  (`tests/nested/fetch-extension.sh`) and
  `--shutdown-noise-from arcmenu@arcmenu.com`: ArcMenu's dialogs throw
  from their own destroy() at shutdown, also without Cornerstone, and
  Cornerstone creates none of them.

Sweep after these: every scenario passes, `routing` and `teardown`
included. 120 unit tests.

- Hidden dash-to-panel slots ask for no room (`Slots.hide()` sets a 0x0
  size): dash-to-panel sizes elements from their preferred size, shown
  or not.
- Action Center layout editor: `action-center-layout` (JSON rows of
  columns of blocks, `src/actionCenter/layout.js`) replaces
  `action-center-swap` and `action-center-hidden-sections`. Each block
  (quick settings, notifications, today, calendar, events, world clocks,
  weather) is its own GNOME widget in its own host; hidden hosts wait in a
  hidden box that stays on stage (an off-stage grid crashed the shell).
  Columns without the message list scroll. The Action Center page shows a
  drag-and-drop mock (`src/prefs/layoutEditor.js`) with block, column and
  row options, move buttons and a hidden tray. `acLayout`, `actionCenter`,
  `prefs`, `button`, `smoke` and `teardown` pass; 132 unit tests.

## Known gaps

- The overflow and tray on vertical bars were not captured; the button
  on a vertical bar was.
- The one button's clock on a side bar splits words and hours/minutes
  onto lines; a custom format's own line breaks are kept.
- No real-session run yet: see docs/testing/cornerstone-checklist.md.
