# Cornerstone

A GNOME Shell 50 and 51 extension that brings the clock, the system menu,
notifications and the tray together, on every monitor. It works as a
companion to [Dash to Panel](https://github.com/home-sweet-gnome/dash-to-panel)
and on GNOME's own top bar.

Cornerstone was developed under the working name Omnibar, as a fork of Dash
to Panel. It now leaves everything Dash to Panel does to Dash to Panel and
holds only its own features: see the
[design](docs/superpowers/specs/2026-10-21-cornerstone-design.md) and the
[plan](docs/superpowers/plans/2026-10-21-cornerstone.md).

## Features

- Action Center: quick settings, notifications and the calendar in one
  popup. The clock and the system menu of any bar (mirrors included) open
  it on that bar's monitor; Super+V / Super+M / Super+S open it on the
  monitor under the pointer; a click on a notification banner opens it too,
  or activates the notification if you prefer. It can be turned off to get
  GNOME's own menus back.
- Mirrored indicators: with Dash to Panel's panels on several monitors, the
  top bar status indicators (AppIndicator, quick settings and others) are
  mirrored on the bars of the other monitors, and their menus open on that
  monitor. Per-monitor, per-indicator switches.

Coming next (see the plan): one bar button for the system indicators and
the clock, a two-column Action Center, per-monitor tray organization with
an overflow, and preferences to customize all of it.

## Install

Cornerstone does not replace Dash to Panel: keep Dash to Panel installed
and enabled if you use it. Moving from Omnibar or from Multi Monitor Bar:
see [`docs/SWITCHING.md`](docs/SWITCHING.md).

```
make zip-file
gnome-extensions install --force cornerstone@etienne-gn.github.io.zip
```

Log out and back in, then enable Cornerstone in Extensions.

## Development

- `npm test`: unit tests.
- `tests/nested/run.sh <scenario> --monitors 2`: a scenario in an isolated,
  headless GNOME Shell with the installed Dash to Panel (`--no-dtp` for the
  stock top bar). See [`tests/nested/README.md`](tests/nested/README.md).
  Never test in your live session.

## Credits

- Tray mirroring is adapted from
  [Multi Monitor Bar](https://github.com/FrederykAbryan/multi-monitors-bar_fapv2)
  by Frederyk Abryan Palinoan, itself derived from
  [Multi Monitors Add-On](https://github.com/spin83/multi-monitors-add-on) by
  spin83.
- The Action Center reuses GNOME Shell's own widgets and follows the logic of
  its `dateMenu.js` and `quickSettings.js`.
- Cornerstone started as a fork of Dash to Panel by Jason DeRose, Charles
  Gagnon and its contributors; their history is kept in this repository.

## License

GPL-2.0-or-later. See [`COPYING`](COPYING).
