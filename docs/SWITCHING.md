# Switching to Cornerstone

Cornerstone runs next to Dash to Panel; it replaces Omnibar and Multi
Monitor Bar.

Identifiers used below:

- Cornerstone: `cornerstone@etienne-gn.github.io`
- Omnibar: `omnibar@etienne-gn.github.io`
- Dash to Panel: `dash-to-panel@jderose9.github.com`
- Multi Monitor Bar: `multi-monitors-bar@frederykabryan`

On Wayland, gnome-shell only discovers a newly installed extension at session
start, so a log out / log in is required.

## From Omnibar

Omnibar contained its own copy of Dash to Panel. Install the real one again
(from extensions.gnome.org or your distribution), then:

```
gnome-extensions disable omnibar@etienne-gn.github.io
make zip-file
gnome-extensions install --force cornerstone@etienne-gn.github.io.zip
```

Log out and back in, then:

```
gnome-extensions enable dash-to-panel@jderose9.github.com
gnome-extensions enable cornerstone@etienne-gn.github.io
```

Omnibar's Dash to Panel settings are not carried over: Dash to Panel keeps
its own settings under `/org/gnome/shell/extensions/dash-to-panel/`, which
Omnibar never touched. Cornerstone starts from its defaults.

Once everything works, remove Omnibar:

```
gnome-extensions uninstall omnibar@etienne-gn.github.io
```

## From Dash to Panel and Multi Monitor Bar

Keep Dash to Panel. Disable Multi Monitor Bar, which would build bars of its
own, then install and enable Cornerstone as above.

```
gnome-extensions disable multi-monitors-bar@frederykabryan
```

## Back

```
gnome-extensions disable cornerstone@etienne-gn.github.io
```

Dash to Panel and GNOME's own menus come back exactly as they were.
