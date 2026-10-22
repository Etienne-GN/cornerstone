# Cornerstone checklist (real session, two monitors)

Everything below has passed in the headless nested shell on GNOME 51.1
with Dash to Panel v74 (see the ledger). None of it has run in a real
session yet. Run this list once on GNOME 51 (Arch) and once on the GNOME 50
workstation, when you choose to: it installs Cornerstone into your session.

Prerequisites: Dash to Panel installed and enabled, two monitors, some
tray icons from extensions (AppIndicator, Vitals...), a media player. Then:

```
cd ~/projects/cornerstone
make zip-file
gnome-extensions install --force cornerstone@etienne-gn.github.io.zip
```

Log out and back in. Disable Omnibar and Multi Monitor Bar if they are
enabled (see `docs/SWITCHING.md`), enable Cornerstone, and note the time for
the journal check:

```
date '+%F %T' | tee ~/cornerstone-check-start.txt
```

## 1. The one button

- Each bar shows one button where the clock and the system menu were: the
  system indicators, then the clock. GNOME's own clock and system menu are
  gone from every bar.
- Indicators change live: mute the sound, unplug the charger, toggle
  Wi-Fi. The button follows on every monitor.
- Clicking the button opens the Action Center on that monitor, the button
  highlighted while it is open. Clicking again closes it.
- Super+V, Super+M and Super+S open it on the monitor under the pointer.

## 2. The Action Center

- Quick settings span the top; notifications (and media controls) are on
  the left, the calendar on the right.
- Toggles, sliders and their submenus (Wi-Fi list, sound output) work.
- With many notifications the popup grows to the screen height and the
  list scrolls; with none it stays compact.
- Clicking a notification banner opens the Action Center (or activates
  the notification if set so in the preferences).

## 3. Tray

- The tray icons appear on every monitor's bar; their menus open on the
  monitor clicked.
- In the preferences (Tray page), pick each monitor and:
  - drag an icon to another place, or use its arrows: the bar follows;
  - put an icon in the Left or Centre box;
  - set an icon to "In the overflow": a chevron appears on that monitor's
    bar; its popup holds the icon, and clicking the icon opens its menu
    against the chevron;
  - set an icon to "Hidden": gone from that monitor only.
  - Reset puts that monitor back to GNOME's order.

## 4. Preferences

- Button page: the preview matches the bar. Turn the clock off, reorder
  elements, hide an indicator, pick each clock format, try a custom format
  with `\n`, change the font. The bars follow live; Reset brings GNOME's
  look back.
- Button page, two monitors: under Monitors, pick the second one and turn
  on its own settings; change its clock and elements. Only that bar
  changes, and it keeps them after unplugging and replugging the monitor
  or restarting Dash to Panel. Turn its own settings off: it looks like
  the others again.
- Action Center page: width (and fit to content), calendar on the left,
  hide sections (weather, world clocks...). The popup follows next time it
  opens.

## 5. Dash to Panel together

- Change a Dash to Panel setting that rebuilds its bars (panel position,
  size, multi-monitor). The button, the tray layout and the overflow come
  back on every bar.
- Disable Dash to Panel: GNOME's top bar shows the button and the Action
  Center works. Enable it again: every bar gets its button back.
- A vertical Dash to Panel bar: the button stacks icons and the clock.

## 6. Off again

- Turn "One button" off: GNOME's clock and system menu come back on every
  bar. Turn the Action Center off: GNOME's own popups come back.
- Disable Cornerstone: Dash to Panel's bars (or the top bar) are exactly
  as before, tray icons in their original order.
- Lock and unlock the screen with Cornerstone on: everything comes back.

## 7. Journal

```
journalctl --user -b --since "$(cat ~/cornerstone-check-start.txt)" \
  | grep -iE 'cornerstone|JS ERROR' | grep -v 'cornerstone-test'
```

Report anything printed, with what you were doing at the time.
