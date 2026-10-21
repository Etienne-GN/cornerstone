# Switching from Dash to Panel + Multi Monitors Bar to Omnibar

Omnibar replaces both extensions. Never run it alongside either of them.

Identifiers used below:

- Omnibar: `omnibar@etienne-gn.github.io`
- Dash to Panel: `dash-to-panel@jderose9.github.com`
- Multi Monitors Bar: `multi-monitors-bar@frederykabryan`

On Wayland, gnome-shell only discovers a newly installed extension at session
start, so a log out / log in is required (there is no `Alt+F2 r`).

## Switch

Build and install the zip (from the repository root):

```
cd ~/git/omnibar
make zip-file
gnome-extensions install --force omnibar@etienne-gn.github.io.zip
```

`make zip-file` writes `omnibar@etienne-gn.github.io.zip` in the repository
root (gitignored). `install --force` unpacks it into
`~/.local/share/gnome-shell/extensions/omnibar@etienne-gn.github.io/`.

Optional: import the Dash to Panel settings. Omnibar's keys are a superset of
Dash to Panel's (same key names, plus `mirror-indicators`,
`mirror-indicator-visibility`, `mirror-indicator-catalog`). Run this before
enabling Omnibar, only if you want it:

```
dconf dump /org/gnome/shell/extensions/omnibar/ > ~/omnibar-backup.ini
dconf dump /org/gnome/shell/extensions/dash-to-panel/ | dconf load /org/gnome/shell/extensions/omnibar/
```

Undo the import (back to schema defaults), or restore the backup:

```
dconf reset -f /org/gnome/shell/extensions/omnibar/
dconf load /org/gnome/shell/extensions/omnibar/ < ~/omnibar-backup.ini
```

The reset
alone returns Omnibar to schema defaults; the `load` restores the backup. The
Dash to Panel settings under `/org/gnome/shell/extensions/dash-to-panel/` are
only read, never modified.

Disable the old extensions, then log out and back in:

```
gnome-extensions disable dash-to-panel@jderose9.github.com
gnome-extensions disable multi-monitors-bar@frederykabryan
```

After logging back in:

```
gnome-extensions enable omnibar@etienne-gn.github.io
gnome-extensions info omnibar@etienne-gn.github.io
```

`info` should report `State: ACTIVE`. If it does not list the extension at
all, the shell did not pick it up: make sure the log out / in was a full one.

## Roll back

Restores Dash to Panel and Multi Monitors Bar exactly as they were (their
settings were never touched):

```
gnome-extensions disable omnibar@etienne-gn.github.io
gnome-extensions enable dash-to-panel@jderose9.github.com
gnome-extensions enable multi-monitors-bar@frederykabryan
```

Then log out and back in. Omnibar can stay installed but disabled; remove it
with `gnome-extensions uninstall omnibar@etienne-gn.github.io` and, if the
settings are no longer wanted, `dconf reset -f /org/gnome/shell/extensions/omnibar/`.

If the shell does not come up cleanly, switch to a TTY and run the same
three `gnome-extensions` commands. From a bare TTY they may fail, because
`gnome-extensions` needs the session D-Bus.

Last resort, pure settings edit (also needs the user's dconf, so it may fail
the same way; otherwise run it from a working terminal). Inspect first:

```
gsettings get org.gnome.shell enabled-extensions
```

Then set the list again with only the Omnibar uuid removed, keeping every
other entry exactly as printed, for example:

```
gsettings set org.gnome.shell enabled-extensions "['dash-to-panel@jderose9.github.com', 'multi-monitors-bar@frederykabryan']"
```

Replace the example list with the printed one minus
`omnibar@etienne-gn.github.io`.
