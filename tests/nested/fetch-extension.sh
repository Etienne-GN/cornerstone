#!/usr/bin/env bash
# Downloads an extension from extensions.gnome.org, for the shell version
# installed here, into .nested/extensions/<uuid>, where run.sh finds it
# after the user's own and the system's extensions. Nothing is installed
# into the live session.
#
#   tests/nested/fetch-extension.sh appindicatorsupport@rgcjonas.gmail.com
set -euo pipefail

uuid="${1:-}"
[[ "$uuid" =~ ^[A-Za-z0-9_][A-Za-z0-9_.@-]*$ ]] || {
  echo "usage: $0 <uuid>" >&2
  exit 2
}

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="$repo/.nested/extensions/$uuid"
shell="$(gnome-shell --version | sed -n 's/^GNOME Shell \([0-9]*\).*/\1/p')"
[[ -n "$shell" ]] || { echo "cannot read the GNOME Shell version" >&2; exit 1; }

info="$(curl -fsS --get "https://extensions.gnome.org/extension-info/" \
  --data-urlencode "uuid=$uuid" --data-urlencode "shell_version=$shell")"
url="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["download_url"])' \
  <<<"$info")"
[[ "$url" == /download-extension/* ]] || {
  echo "unexpected download url: $url" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://extensions.gnome.org$url" -o "$tmp/ext.zip"
mkdir "$tmp/ext"
python3 -I -m zipfile -e "$tmp/ext.zip" "$tmp/ext"
got="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' \
  "$tmp/ext/metadata.json")"
[[ "$got" == "$uuid" ]] || { echo "archive is $got, not $uuid" >&2; exit 1; }

rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
mv "$tmp/ext" "$dest"
echo "$uuid for GNOME $shell in $dest"
