#!/usr/bin/env bash
# Run one scenario in an isolated headless GNOME Shell.
# Usage: tests/nested/run.sh <scenario> [--monitors N] [--vertical]
set -euo pipefail

usage() {
  echo "usage: $0 <scenario> [--monitors N] [--vertical]" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
scenario="$1"
shift
monitors=1
vertical=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --monitors)
      [[ $# -ge 2 && "$2" =~ ^[1-9][0-9]*$ ]] || usage
      monitors="$2"
      shift 2
      ;;
    --vertical)
      vertical=1
      shift
      ;;
    *) usage ;;
  esac
done

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo/tests/nested/scenarios/$scenario.js"
[[ -f "$script" ]] || { echo "no such scenario: $script" >&2; exit 2; }

work="$repo/.nested/$scenario"
log="$work/shell.log"
rm -rf "$work"
mkdir -p "$work"/{config,data,cache,runtime,tmp}
chmod 700 "$work/runtime"

uuid="$(sed -n 's/^ *"uuid": *"\([^"]*\)".*/\1/p' "$repo/metadata.json")"
[[ -n "$uuid" ]] || { echo "cannot read uuid from metadata.json" >&2; exit 2; }
ext_dir="$work/data/gnome-shell/extensions/$uuid"

(cd "$repo" && nice -n 19 make -s _build >"$work/build.log" 2>&1) || {
  cat "$work/build.log" >&2
  exit 1
}
mkdir -p "$(dirname "$ext_dir")"
cp -r "$repo/_build" "$ext_dir"
rm -rf "$repo/_build"
glib-compile-schemas "$ext_dir/schemas"

mkdir -p "$work/config/glib-2.0/settings"
cat >"$work/config/glib-2.0/settings/keyfile" <<'EOF'
[org/gnome/shell]
disable-user-extensions=false
enabled-extensions=@as []
welcome-dialog-last-shown-version='999'

[org/gnome/desktop/interface]
enable-animations=false
EOF

sysbus_sock="$work/system_bus_socket"
cat >"$work/system-bus.conf" <<EOF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>custom</type>
  <listen>unix:path=$sysbus_sock</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
EOF

# Start from an empty environment so nothing points back at the live
# session (display, session and system bus, keyring, ssh-agent, journal).
nested_env=(
  HOME="$HOME" USER="$USER" LOGNAME="${LOGNAME:-$USER}" PATH="$PATH"
  LANG="${LANG:-C.UTF-8}" SHELL="${SHELL:-/bin/bash}"
  XDG_CONFIG_HOME="$work/config"
  XDG_DATA_HOME="$work/data"
  XDG_CACHE_HOME="$work/cache"
  XDG_RUNTIME_DIR="$work/runtime"
  TMPDIR="$work/tmp"
  GSETTINGS_BACKEND=keyfile
  MUTTER_WM_CLASS_FILTER=Gnome-shell-perf-helper
  OMNIBAR_EXT_DIR="$ext_dir"
  NESTED_MONITORS="$monitors"
  NESTED_VERTICAL="$vertical"
  DBUS_SYSTEM_BUS_ADDRESS="unix:path=$sysbus_sock"
)

args=(--devkit --headless --wayland --no-x11 --unsafe-mode
  --wayland-display omnibar-nested)
for ((i = 0; i < monitors; i++)); do
  args+=(--virtual-monitor 1920x1080)
done
args+=(--automation-script "$script")

shell_pid=
sysbus_pid=
kill_session() {
  [[ -n "$1" ]] || return 0
  if pkill -TERM -s "$1" 2>/dev/null; then
    sleep 1
    pkill -KILL -s "$1" 2>/dev/null || true
  fi
}
cleanup() {
  kill_session "$shell_pid"
  kill_session "$sysbus_pid"
  shell_pid=
  sysbus_pid=
}
trap cleanup EXIT
trap 'exit 130' INT TERM

setsid env -i "${nested_env[@]}" nice -n 19 \
  dbus-daemon --nofork --nosyslog --config-file="$work/system-bus.conf" \
  >"$work/system-bus.log" 2>&1 &
sysbus_pid=$!
for ((i = 0; i < 50; i++)); do
  [[ -S "$sysbus_sock" ]] && break
  sleep 0.1
done
[[ -S "$sysbus_sock" ]] || {
  cat "$work/system-bus.log" >&2
  echo "FAIL $scenario: private system bus did not start" >&2
  exit 1
}

setsid env -i "${nested_env[@]}" timeout -k 10 120 nice -n 19 \
  dbus-run-session -- gnome-shell "${args[@]}" >"$log" 2>&1 &
shell_pid=$!
status=0
wait "$shell_pid" || status=$?
cleanup

fail=0
if [[ $status -ne 0 ]]; then
  echo "FAIL $scenario: shell exited with status $status" >&2
  fail=1
fi
if grep -n 'JS ERROR' "$log" >&2; then
  echo "FAIL $scenario: JS ERROR in $log" >&2
  fail=1
fi
if grep -n -E '(CRITICAL|ERROR) \*\*.*\[omnibar\]' "$log" >&2; then
  echo "FAIL $scenario: [omnibar] error in $log" >&2
  fail=1
fi
if grep -n 'Will monitor session' "$log" >&2; then
  echo "FAIL $scenario: shell reached a logind session" >&2
  fail=1
fi
for what in session display; do
  if grep -q "Registering $what with GDM" "$log" &&
    ! grep -q "Error registering $what with GDM" "$log"; then
    echo "FAIL $scenario: GDM $what registration was not refused" >&2
    fail=1
  fi
done
[[ $fail -eq 0 ]] || exit 1
echo "PASS $scenario"
