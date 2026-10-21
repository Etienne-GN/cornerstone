# Renaming the fork

`metadata.json` is the single source of identity. The Makefile reads `uuid`,
`settings-schema`, `gettext-domain` and `name` from it, and the extension
code calls `getSettings()` and reads `metadata.name` at runtime.

Current values:

- uuid: `omnibar@etienne-gn.github.io`
- settings-schema: `org.gnome.shell.extensions.omnibar`
- schema path: derived, `/org/gnome/shell/extensions/omnibar/`
- gettext-domain: `omnibar`
- name: `Omnibar`

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

- `global.dashToPanel` and the `dashtopanel*` CSS and actor names, kept for
  compatibility with extensions that depend on them
- upstream license headers and the Dash to Panel credits
- the translated strings in `po/*.po`, whose msgids still say "Dash to Panel"
  where they were not parameterised
- the `gettext-domain` attribute inside the schema file
