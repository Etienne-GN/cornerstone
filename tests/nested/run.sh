#!/usr/bin/env bash
# Run one scenario in an isolated GNOME Shell, headless by default.
# Usage: tests/nested/run.sh <scenario> [--monitors N] [--vertical]
#        [--viewer] [--with-extension <uuid>]...
set -euo pipefail

usage() {
  echo "usage: $0 <scenario> [--monitors N] [--vertical] [--viewer]" \
    "[--with-extension <uuid>]..." >&2
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
viewer=0
with_ext=()
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
    --viewer)
      viewer=1
      shift
      ;;
    --with-extension)
      [[ $# -ge 2 && "$2" =~ ^[A-Za-z0-9_][A-Za-z0-9_.@-]*$ ]] || usage
      with_ext+=("$2")
      shift 2
      ;;
    *) usage ;;
  esac
done

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo/tests/nested/scenarios/$scenario.js"
[[ -f "$script" ]] || { echo "no such scenario: $script" >&2; exit 2; }

ext_srcs=()
for u in "${with_ext[@]}"; do
  src=""
  for base in "$HOME/.local/share/gnome-shell/extensions" \
    /usr/share/gnome-shell/extensions; do
    [[ -f "$base/$u/metadata.json" ]] && {
      src="$base/$u"
      break
    }
  done
  [[ -n "$src" ]] || {
    echo "extension not installed: $u" >&2
    exit 2
  }
  ext_srcs+=("$src")
done

# mutter-devkit is a GTK client of the host compositor; it inherits the
# shell's environment. An absolute WAYLAND_DISPLAY lets it reach the host
# socket while the shell keeps its private XDG_RUNTIME_DIR.
host_display=""
if [[ $viewer -eq 1 ]]; then
  host_display="${WAYLAND_DISPLAY:-}"
  [[ -n "$host_display" && "$host_display" != /* ]] &&
    host_display="${XDG_RUNTIME_DIR:-}/$host_display"
  [[ -S "$host_display" ]] || {
    echo "--viewer needs a live Wayland display (WAYLAND_DISPLAY)" >&2
    exit 2
  }
fi

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

enabled="@as []"
if [[ ${#with_ext[@]} -gt 0 ]]; then
  enabled="[$(printf "'%s'," "${with_ext[@]}")"
  enabled="${enabled%,}]"
fi
for i in "${!with_ext[@]}"; do
  u="${with_ext[$i]}"
  [[ "$u" != "$uuid" ]] || {
    echo "--with-extension $u is the extension under test" >&2
    exit 2
  }
  # Source dirs are only read; the copy is writable and private.
  cp -rL --no-preserve=mode,ownership "${ext_srcs[$i]}" \
    "$work/data/gnome-shell/extensions/$u"
  [[ -d "$work/data/gnome-shell/extensions/$u/schemas" ]] &&
    glib-compile-schemas "$work/data/gnome-shell/extensions/$u/schemas"
done

mkdir -p "$work/config/glib-2.0/settings"
cat >"$work/config/glib-2.0/settings/keyfile" <<EOF
[org/gnome/shell]
disable-user-extensions=false
enabled-extensions=$enabled
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

args=(--devkit --wayland --no-x11 --unsafe-mode
  --wayland-display omnibar-nested)
[[ $viewer -eq 1 ]] || args+=(--headless)
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

if [[ $viewer -eq 1 ]]; then
  # Interactive: no timeout, normal-ish priority; ends when the shell exits
  # or on Ctrl+C (the INT trap exits and the EXIT trap kills the sessions).
  nested_env+=(WAYLAND_DISPLAY="$host_display")
  shell_cmd=(nice -n 10)
  echo "viewer mode: log $log (Ctrl+C to stop)" >&2
else
  shell_cmd=(timeout -k 10 120 nice -n 19)
fi
start_session shell "$log" "${shell_cmd[@]}" \
  dbus-run-session -- gnome-shell "${args[@]}"
status=0
wait "$launched_pid" || status=$?
kill_sessions

fail=0
if [[ $viewer -eq 1 ]]; then
  # Closing the viewer shuts the shell down with the extension still
  # enabled; only errors raised before that point fail the session.
  sed '/Shutting down GNOME Shell/,$d' "$log" >"$work/live.log"
  grep -n 'JS ERROR' "$log" >"$work/all-js-errors.log" || true
  if [[ -s "$work/all-js-errors.log" ]] &&
    ! grep -q 'JS ERROR' "$work/live.log"; then
    echo "note: JS ERROR only during shutdown, see $log" >&2
  fi
  checked="$work/live.log"
else
  checked="$log"
fi
if [[ $viewer -eq 1 ]]; then
  echo "viewer session ended (shell status $status)" >&2
elif [[ $status -ne 0 ]]; then
  echo "FAIL $scenario: shell exited with status $status" >&2
  fail=1
fi
if [[ $viewer -eq 0 ]] &&
  ! grep -q -E "\[omnibar-test\] DONE $scenario\$" "$log"; then
  echo "FAIL $scenario: no '[omnibar-test] DONE $scenario' in $log" >&2
  fail=1
fi
if grep -n 'JS ERROR' "$checked" >&2; then
  echo "FAIL $scenario: JS ERROR in $log" >&2
  fail=1
fi
# Error level only: the stock shell logs Gjs-CRITICAL GC warnings for its
# own panel actors at shutdown, which must not fail a run.
if grep -n -E '(CRITICAL|ERROR) \*\*.*\[omnibar\]' "$checked" >&2; then
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
