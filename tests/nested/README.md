# Nested test harness

Every run is an isolated GNOME Shell: `env -i` allowlist, private system and
session buses, private XDG/HOME/TMPDIR, keyfile GSettings. Logs go to
`.nested/<scenario>/shell.log`.

    tests/nested/run.sh <scenario> [--monitors N] [--vertical]
      [--viewer] [--no-dtp] [--with-extension <uuid>]...

The installed Dash to Panel (`~/.local/share/gnome-shell/extensions`) is
copied in and enabled too, as Cornerstone runs beside it; `--no-dtp` tests
GNOME's own top bar instead.

Headless runs end with `[cornerstone-test] DONE <scenario>` and a 120 s timeout.

## Interactive viewer

    tests/nested/run.sh interactive --viewer --monitors 2

Needs a mutter built with devkit support (CachyOS's is not). Opens the
mutter-devkit window so you can look at and click the nested shell.
No timeout and no DONE sentinel: the run ends on Ctrl+C or when the shell
exits. The shell runs at `nice -n 10`.

The viewer is a GTK client of your live compositor and inherits the shell's
environment, so the shell gets one host variable: `WAYLAND_DISPLAY` as an
absolute socket path. `XDG_RUNTIME_DIR` stays private.

`--with-extension <uuid>` (repeatable) copies an installed extension from
`~/.local/share/gnome-shell/extensions` (else `/usr/share/gnome-shell/
extensions`) into the nested data dir and enables it at startup. The source
is only read.

## Teardown with third-party extensions

    tests/nested/run.sh teardown --monitors 2 \
      --with-extension arcmenu@arcmenu.com \
      --with-extension appindicatorsupport@rgcjonas.gmail.com

Cycles ArcMenu and Cornerstone, then ends with both enabled so the shell's own
shutdown runs under live mirrors. Headless runs check the whole log,
shutdown included, and fail when the shell never reached shutdown.

`static-copy --monitors 2 --with-extension clipboard-history@alexsaveau.dev`
fails on any off-stage theme-node lookup while the clipboard indicator is
mirrored.
