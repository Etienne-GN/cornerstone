#!/usr/bin/env bash
# Rewrite the fork identity. metadata.json is the single source of truth;
# this updates it and the few files that must carry the same literals.
# Usage: tools/rename.sh <slug> "<Display Name>"
set -euo pipefail

usage() {
  echo "usage: $0 <slug> \"<Display Name>\"" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage
slug="$1"
name="$2"
[[ "$slug" =~ ^[a-z][a-z0-9-]*$ ]] || {
  echo "invalid slug: $slug" >&2
  exit 2
}
[[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._-]*$ ]] || {
  echo "invalid display name: $name" >&2
  exit 2
}

# GType names cannot contain spaces or dots.
new_type="${name//[^A-Za-z0-9]/}"
[[ "$new_type" =~ ^[A-Za-z] ]] || {
  echo "display name must start with a letter: $name" >&2
  exit 2
}

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

meta() {
  sed -n "s/^ *\"$1\": *\"\([^\"]*\)\".*/\1/p" metadata.json
}

old_uuid="$(meta uuid)"
old_schema="$(meta settings-schema)"
old_domain="$(meta gettext-domain)"
old_name="$(meta name)"
for v in "$old_uuid" "$old_schema" "$old_domain" "$old_name"; do
  [[ -n "$v" ]] || {
    echo "cannot read current identity from metadata.json" >&2
    exit 1
  }
done

new_uuid="$slug@etienne-gn.github.io"
new_schema="org.gnome.shell.extensions.$slug"
old_path="/${old_schema//.//}/"
new_path="/${new_schema//.//}/"

sed -i \
  -e "s|^\( *\"extension-id\": *\)\"[^\"]*\"|\1\"$slug\"|" \
  -e "s|^\( *\"uuid\": *\)\"[^\"]*\"|\1\"$new_uuid\"|" \
  -e "s|^\( *\"name\": *\)\"[^\"]*\"|\1\"$name\"|" \
  -e "s|^\( *\"settings-schema\": *\)\"[^\"]*\"|\1\"$new_schema\"|" \
  -e "s|^\( *\"gettext-domain\": *\)\"[^\"]*\"|\1\"$slug\"|" \
  metadata.json

old_xml="schemas/$old_schema.gschema.xml"
new_xml="schemas/$new_schema.gschema.xml"
[[ -f "$old_xml" ]] || {
  echo "missing $old_xml" >&2
  exit 1
}
sed -i -e "s|$old_path|$new_path|g" -e "s|$old_schema|$new_schema|g" "$old_xml"
if [[ "$old_xml" != "$new_xml" ]]; then
  if git ls-files --error-unmatch "$old_xml" >/dev/null 2>&1; then
    git mv "$old_xml" "$new_xml"
  else
    mv "$old_xml" "$new_xml"
  fi
fi

sed -i \
  -e "s|^$old_uuid\*|$new_uuid*|" \
  -e "s|^po/$old_domain\.pot\$|po/$slug.pot|" \
  .gitignore

if [[ "$old_domain" != "$slug" && -f "po/$old_domain.pot" ]]; then
  mv "po/$old_domain.pot" "po/$slug.pot"
fi

# GType names are prefixed with the display name reduced to its
# alphanumerics, log lines with [<slug>].
old_type="${old_name//[^A-Za-z0-9]/}"
found="$(grep -rlE --include='*.js' \
  -e "GTypeName: '$old_type" -e "\\[$old_domain\\]" src)" ||
  [[ $? -eq 1 ]]
mapfile -t sources <<<"$found"
if [[ -n "$found" ]]; then
  sed -i \
    -e "s|GTypeName: '$old_type|GTypeName: '$new_type|g" \
    -e "s|\\[$old_domain\\]|[$slug]|g" \
    "${sources[@]}"
fi
