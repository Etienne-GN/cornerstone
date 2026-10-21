# GNOME 51 step-2 checklist (Arch, two monitors)

Step 1 has not been run yet: the owner chose to go ahead with the Action
Center before the step-1 check. Run
[`gnome51-step1.md`](gnome51-step1.md) (mirroring) first, in the same
session, then this list. Report both together. Repeat both on the GNOME 50
workstation.

Goal: confirm the Action Center on a real GNOME 51 session. The nested tests
ran on GNOME Shell 50.5 only; the GNOME 51 code paths (params-style menu
close, `setCaptureContainer`, keynav flags, banner click) have not run
anywhere yet.

Prerequisites: two monitors, a Wi-Fi adapter and Bluetooth if available, a
media player (a browser playing a video is enough), and the indicator
extensions you use. Follow `docs/SWITCHING.md` up to and including enabling
Omnibar. Note the start time for the journal check:

```
mkdir -p ~/git/omnibar/.nested
date '+%F %T' | tee ~/git/omnibar/.nested/omnibar-step2-start.txt
```

## 1. Open from the bar

On each monitor in turn:

- Click the clock: the Action Center opens on that monitor, with quick
  settings at the top, then notifications, then the calendar. GNOME's own
  calendar does not open.
- Click the clock again or click away: it closes.
- Click the quick settings icon (on the secondary bar, the mirrored one): it
  opens on that monitor. GNOME's own system menu does not open.
- The popup sits inside the monitor, above the bar, nothing cut off.

## 2. Keyboard shortcuts

Put the pointer on one monitor, then the other:

- Super+V opens the Action Center on the monitor under the pointer. Super+V
  again closes it.
- Same with Super+M and Super+S.
- With it open on one monitor, pressing the shortcut closes it (it does not
  jump to the other monitor).
- Arrow keys and Tab move through the popup right after it opens.

## 3. Quick toggle submenus

- Wi-Fi: open the arrow of the Wi-Fi toggle. The network list opens over the
  popup, the rest dims. Pick nothing, close it with Escape or the back
  arrow: the dim goes away.
- Bluetooth: same.
- Volume and brightness sliders work.

## 4. Media player

Play something. The media controls show in the notification area of the
Action Center, and play/pause works from there.

## 5. Notification banners

```
notify-send 'Omnibar test' 'banner click'
```

- Click the banner body: the Action Center opens on the banner's monitor and
  the notification is listed. The notification is not activated.
- New banner, click its close button: it goes away, the Action Center does not
  open.
- Preferences, "Notification banner click" set to "Activate the
  notification" (no restart). New banner, click it: GNOME's behaviour (the
  notification is activated and removed), the Action Center stays closed.
  Set it back to "Open the Action Center".

## 6. Preferences

```
gnome-extensions prefs omnibar@etienne-gn.github.io
```

Page "Multi-monitor & Action Center":

- Order: Action Center group first, then "Mirrored indicators" with its
  master switch, then one group per monitor.
- Switch "Action Center" off: the clock opens GNOME's calendar again, with
  the calendar and the notification list in it; quick settings opens GNOME's
  system menu; Super+V/M/S open GNOME's menus; the banner click combo greys
  out.
- Switch it on again: the clock opens the Action Center.
- Do it 3 times. On the third, do it with the Action Center open: the popup
  is modal, so run this in a terminal and open the popup within the 5 s:

  ```
  sleep 5; dconf write /org/gnome/shell/extensions/omnibar/action-center false
  ```

  The popup closes cleanly and GNOME's calendar works. Turn it back on with
  `dconf write /org/gnome/shell/extensions/omnibar/action-center true`.

## 7. Screenshot from quick settings

Open the Action Center, click the screenshot button in the quick settings
area, take a screenshot of the whole screen. The popup is gone before the
capture: it must not appear in the screenshot.

## 8. Vertical secondary bar

As in step 1 item 4, put the secondary bar on Left, then Right. Open the
Action Center from that bar's clock and quick settings mirror:

- The popup opens beside the bar, its arrow on the bar side, fully inside the
  monitor and not over the bar.
- Super+V with the pointer on that monitor opens it at the same place.

Put the position back afterwards. Not covered by a test on a real session
before.

## 9. Intellihide with the Action Center open

Known gap, untested: with intellihide on, the bar may hide while the Action
Center is open, because intellihide does not know about the popup. Turn
intellihide on (page "Behavior"), open the Action Center from the clock,
leave the pointer inside the popup for 5 s. Note whether the bar hides and
whether the popup stays usable. Turn intellihide back off. Report what
happens; this is not a pass/fail item.

## 10. Lock / unlock

GNOME disables extensions while the screen is locked. Repeat 3 times:

1. Open the Action Center on the secondary monitor (open a Wi-Fi submenu on
   the second round).
2. `Super+L`.
3. Unlock.
4. The clock and quick settings open the Action Center again, on each
   monitor; nothing is duplicated; GNOME's own menus never show.

Then one round with the Action Center off:

1. `dconf write /org/gnome/shell/extensions/omnibar/action-center false`
2. `Super+L`, then unlock.
3. The clock opens GNOME's calendar (calendar and notifications in it),
   quick settings opens GNOME's system menu, Super+V/M/S open GNOME's menus.
   No Action Center anywhere.
4. `dconf write /org/gnome/shell/extensions/omnibar/action-center true`: the
   clock and quick settings open the Action Center again.

## 11. Disable with the popup open

```
sleep 5; gnome-extensions disable omnibar@etienne-gn.github.io
```

Open the Action Center within the 5 s. Expected: it closes, the bars go back
to stock GNOME, the clock opens GNOME's calendar with the calendar and
notifications in it, quick settings opens GNOME's system menu, no frozen
input. Then:

```
gnome-extensions enable omnibar@etienne-gn.github.io
```

The Action Center works again.

## 12. Journal

```
journalctl --user -b --since "$(cat ~/git/omnibar/.nested/omnibar-step2-start.txt)" | grep -E 'JS ERROR|\[omnibar\]|already disposed|isnan'
```

Expected output: empty. Omnibar logs only errors with the `[omnibar]` prefix,
so every `[omnibar]` line is a failure. If the user journal holds nothing
from gnome-shell,
use the system journal as in step 1 item 7 (same grep).

Any hit is a failure. Keep the matching lines and the time of the action that
triggered them.

## Result to report

Per item, for step 1 and step 2: pass or fail. On failure: the journal lines,
`gnome-shell --version`, which monitor and bar position, and what was open.
For item 9, what you saw.
