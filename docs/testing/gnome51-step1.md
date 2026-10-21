# GNOME 51 step-1 checklist (Arch, two monitors)

Goal: confirm indicator mirroring on a real GNOME 51 session before further
work. Repeat the same list on the GNOME 50 workstation.

Prerequisites: two monitors, and the indicator extensions you actually use
installed and enabled on the primary bar (AppIndicator, Vitals, system
monitor, ArcMenu). Follow `docs/SWITCHING.md` up to and including enabling
Omnibar.

Note the start time, so the journal check ignores earlier boots' noise:

```
mkdir -p ~/git/omnibar/.nested
date '+%F %T' | tee ~/git/omnibar/.nested/omnibar-start.txt
```

## 1. Baseline

- Omnibar is `ACTIVE`: `gnome-extensions info omnibar@etienne-gn.github.io`.
- A bar is shown on each monitor.
- Each indicator present on the primary top bar (AppIndicator tray icons,
  Vitals, system monitor, ArcMenu, quick settings) has a mirror on the
  secondary bar.
- The quick-settings mirror on the secondary bar shows the same icons as the
  primary.

## 2. Menus

For each mirror on the secondary bar, click it:

- Its real menu opens, anchored on the secondary monitor (not on the primary).
- Menu contents match what the primary indicator shows.
- Click away: the menu closes, the mirror is still usable.
- Quick settings: sliders and toggles work from the mirror.

## 3. Preferences

```
gnome-extensions prefs omnibar@etienne-gn.github.io
```

Open page "Multi-monitor & Action Center":

- Master switch `mirror-indicators` ("Mirror status indicators"): off removes
  all mirrors on every secondary bar, on brings them back.
- One group per monitor, one switch per indicator. Toggling a switch hides or
  shows that mirror on that monitor only.
- With the prefs window still open, unplug the secondary monitor: its group
  disappears. Replug: the group is rebuilt with its switches, and states are
  kept.

## 4. Vertical secondary bar

In Omnibar settings, page "Position", group "Order and Position on
monitors": untick "Apply changes to all monitors", pick the secondary monitor
in the monitor drop-down, then under "Panel monitor position" choose Left or
Right. Check that mirrors render correctly (orientation, size, spacing, no
clipping), menus still open on that monitor, and toggling still works. Put
the position back afterwards.

## 5. Monitor hot-plug

Unplug and replug the secondary monitor 3 times. Each time: bar and mirrors
return, nothing stays on the missing monitor, no frozen shell.

## 6. Lock / unlock

GNOME disables extensions while the screen is locked and re-enables them on
unlock. Repeat 3 times:

1. Open a mirror menu on the secondary bar.
2. Lock the session (`Super+L`) with that menu still open.
3. Unlock.
4. Mirrors are back on all secondary bars, menus open again, no duplicates.

## 7. Journal

The shell log goes to the user journal on a systemd-managed session:

```
journalctl --user -b --since "$(cat ~/git/omnibar/.nested/omnibar-start.txt)" | grep -E 'JS ERROR|\[omnibar\]|already disposed'
```

Expected output: empty. If the user journal holds nothing from gnome-shell
(verify with `journalctl --user -b _COMM=gnome-shell | tail -3`), use the
system journal, which needs membership of `systemd-journal`, `wheel` or `adm`:

```
journalctl -b _COMM=gnome-shell --since "$(cat ~/git/omnibar/.nested/omnibar-start.txt)" | grep -E 'JS ERROR|\[omnibar\]|already disposed'
```

Any hit is a failure. Keep the matching lines and the time of the action that
triggered them.

## Result to report

Per item above: pass or fail, plus on failure the journal lines, the GNOME
and indicator extension versions (`gnome-shell --version`,
`gnome-extensions info <uuid>`) and which monitor/layout was involved.
