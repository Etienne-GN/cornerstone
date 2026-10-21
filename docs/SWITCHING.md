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
`mirror-indicator-visibility`, `mirror-indicator-catalog`, `action-center`,
`action-center-banner-click`). Run this before
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

The reset alone returns Omnibar to schema defaults; the `load` restores the
backup. The Dash to Panel settings under
`/org/gnome/shell/extensions/dash-to-panel/` are only read, never modified.

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

## Action Center

Omnibar turns the Action Center on by default. With it on:

- The clock and the system menu (quick settings) of every bar, and the
  quick settings mirrors, open the Action Center on that bar's monitor
  instead of GNOME's calendar and system menu.
- Super+V and Super+M (`toggle-message-tray`) and Super+S
  (`toggle-quick-settings`) open it on the monitor under the pointer, and
  close it when it is open.
- A click on a notification banner opens it. To get GNOME's behaviour
  (activate the notification), set "Notification banner click" to
  "Activate the notification".

To get GNOME's own menus back without disabling Omnibar, switch off
"Action Center" on the "Multi-monitor & Action Center" preferences page, or:

```
dconf write /org/gnome/shell/extensions/omnibar/action-center false
```

It takes effect at once, no log out needed. `dconf reset
/org/gnome/shell/extensions/omnibar/action-center` turns it back on.

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

Last resort, pure settings edit (it needs the user's dconf, so it may fail
the same way from a bare TTY; otherwise run it from a working terminal).
Do not type the extension list by hand: it holds every enabled extension and
a hand-typed list silently drops the others.

Back up and inspect the current list:

```
gsettings get org.gnome.shell enabled-extensions > ~/enabled-extensions-backup.txt
cat ~/enabled-extensions-backup.txt
```

Remove only the Omnibar uuid from the current list:

```
gsettings set org.gnome.shell enabled-extensions "$(gsettings get org.gnome.shell enabled-extensions | sed -e "s/'omnibar@etienne-gn.github.io', *//" -e "s/, *'omnibar@etienne-gn.github.io'//" -e "s/'omnibar@etienne-gn.github.io'//")"
```

Check the result with `gsettings get org.gnome.shell enabled-extensions`.
Then, after logging in, re-enable the old extensions in a normal session:

```
gnome-extensions enable dash-to-panel@jderose9.github.com
gnome-extensions enable multi-monitors-bar@frederykabryan
```
