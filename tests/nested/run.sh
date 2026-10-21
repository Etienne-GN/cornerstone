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
[[ "$scenario" =~ ^[A-Za-z0-9_-]+$ ]] || {
  echo "invalid scenario name: $scenario" >&2
  exit 2
}
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
mkdir -p "$work"/{home,config,data,cache,runtime,tmp}
chmod 700 "$work/runtime"

uuid="$(sed -n 's/^ *"uuid": *"\([^"]*\)".*/\1/p' "$repo/metadata.json")"
[[ "$uuid" =~ ^[A-Za-z0-9_.@-]+$ ]] || {
  echo "cannot read a valid uuid from metadata.json" >&2
  exit 2
}
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
user="${USER:-$(id -un)}"
nested_env=(
  HOME="$work/home" USER="$user" LOGNAME="$user" PATH="$PATH"
  LANG="${LANG:-C.UTF-8}" SHELL="${SHELL:-/bin/bash}"
  XDG_CONFIG_HOME="$work/config"
  XDG_DATA_HOME="$work/data"
  XDG_CACHE_HOME="$work/cache"
  XDG_RUNTIME_DIR="$work/runtime"
  TMPDIR="$work/tmp"
  GSETTINGS_BACKEND=keyfile
  # Keep the perf helper's window out of the shell's window list.
  MUTTER_WM_CLASS_FILTER=Gnome-shell-perf-helper
  OMNIBAR_EXT_DIR="$ext_dir"
  NESTED_MONITORS="$monitors"
  NESTED_VERTICAL="$vertical"
  NESTED_LOG="$log"
  DBUS_SYSTEM_BUS_ADDRESS="unix:path=$sysbus_sock"
)

args=(--devkit --headless --wayland --no-x11 --unsafe-mode
  --wayland-display omnibar-nested)
for ((i = 0; i < monitors; i++)); do
  args+=(--virtual-monitor 1920x1080)
done
args+=(--automation-script "$script")

sids=()
kill_sessions() {
  local sid
  for sid in "${sids[@]}"; do
    if pkill -TERM -s "$sid" 2>/dev/null; then
      sleep 1
      pkill -KILL -s "$sid" 2>/dev/null || true
    fi
  done
  sids=()
}
trap kill_sessions EXIT
trap 'exit 130' INT TERM

# Run "$@" in a new session with the nested environment, output to $2, and
# record the session id so kill_sessions reaches every descendant.
start_session() {
  local name="$1" out="$2" sid_file="$work/$1.sid" i
  shift 2
  # shellcheck disable=SC2016
  setsid --wait env -i "${nested_env[@]}" \
    sh -c 'echo "$$" >"$0"; exec "$@"' "$sid_file" "$@" >"$out" 2>&1 &
  launched_pid=$!
  for ((i = 0; i < 50; i++)); do
    [[ -s "$sid_file" ]] && break
    sleep 0.1
  done
  [[ -s "$sid_file" ]] || {
    echo "FAIL $scenario: $name did not start" >&2
    exit 1
  }
  sids+=("$(cat "$sid_file")")
}

start_session system-bus "$work/system-bus.log" nice -n 19 \
  dbus-daemon --nofork --nosyslog --config-file="$work/system-bus.conf"
for ((i = 0; i < 50; i++)); do
  [[ -S "$sysbus_sock" ]] && break
  sleep 0.1
done
[[ -S "$sysbus_sock" ]] || {
  cat "$work/system-bus.log" >&2
  echo "FAIL $scenario: private system bus did not start" >&2
  exit 1
}

start_session shell "$log" timeout -k 10 120 nice -n 19 \
  dbus-run-session -- gnome-shell "${args[@]}"
status=0
wait "$launched_pid" || status=$?
kill_sessions

fail=0
if [[ $status -ne 0 ]]; then
  echo "FAIL $scenario: shell exited with status $status" >&2
  fail=1
fi
if ! grep -q -E "\[omnibar-test\] DONE $scenario\$" "$log"; then
  echo "FAIL $scenario: no '[omnibar-test] DONE $scenario' in $log" >&2
  fail=1
fi
if grep -n 'JS ERROR' "$log" >&2; then
  echo "FAIL $scenario: JS ERROR in $log" >&2
  fail=1
fi
# Error level only: the stock shell logs Gjs-CRITICAL GC warnings for its
# own panel actors at shutdown, which must not fail a run.
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
# The polkit agent logs only its failure; silence means it registered.
if ! grep -q 'Failed to register AuthenticationAgent' "$log"; then
  echo "FAIL $scenario: polkit authentication agent registered" >&2
  fail=1
fi
[[ $fail -eq 0 ]] || exit 1
echo "PASS $scenario"
