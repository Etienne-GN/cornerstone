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

- One button: the clock and the system menu of every bar become one button
  showing the system indicators and the clock. Which indicators, their
  order, the clock format (presets or your own) and its font are yours to
  pick, with a live preview in the preferences. Each monitor can follow
  the others or have its own button. More options take your own clock
  format and the spacing.
- Action Center: quick settings across the top, notifications on the left,
  the calendar on the right, in one popup that opens on the monitor you
  clicked. Width, column sides and sections (weather, world clocks...) are
  settings. Super+V / Super+M / Super+S open it on the monitor under the
  pointer; a click on a notification banner opens it too, or activates the
  notification if you prefer.
- Tray on every monitor: with Dash to Panel's bars on several monitors,
  the tray icons (AppIndicator, Vitals and others) show on every bar and
  their menus open there.
- Tray organization, per monitor: order the icons, put them in the left,
  centre or right part of the bar, hide them, or tuck them in an overflow
  behind a chevron, Windows style, in a grid as wide as you like.
- Everything can be turned off to get GNOME's own clock, menus and
  popups back.

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
