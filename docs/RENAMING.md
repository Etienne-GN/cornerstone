# Renaming the extension

`metadata.json` is the single source of identity. The Makefile reads `uuid`,
`settings-schema`, `gettext-domain` and `name` from it, and the extension
code calls `getSettings()` and reads `metadata.name` at runtime.

Current values:

- uuid: `cornerstone@etienne-gn.github.io`
- settings-schema: `org.gnome.shell.extensions.cornerstone`
- schema path: derived, `/org/gnome/shell/extensions/cornerstone/`
- gettext-domain: `cornerstone`
- name: `Cornerstone`

## Changing the name

```
tools/rename.sh <slug> "<Display Name>"
```

The slug must match `[a-z][a-z0-9-]*`. The script rewrites:

- `metadata.json`: `extension-id`, `uuid`, `name`, `settings-schema`,
  `gettext-domain`
- the schema file name, its schema id, path and enum ids
- the zip and `.pot` patterns in `.gitignore`
- `po/<domain>.pot`, if present

Review with `git diff`, then run `npm test` and
`tests/nested/run.sh smoke --monitors 2`.

## Deliberately unchanged

- `dash-to-panel@jderose9.github.com` in `src/panels.js`: Cornerstone follows
  that extension, it is not Cornerstone's own identity
- the `gettext-domain` attribute inside the schema file
