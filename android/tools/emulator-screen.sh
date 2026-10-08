#!/usr/bin/env bash
# Gives the emulator CI has just created (and not started yet) a screen of WIDTH x HEIGHT pixels at
# DENSITY dpi: `bash android/tools/emulator-screen.sh 720 1600 320`. It rewrites the six display
# lines of the AVD's config.ini and leaves everything else as avdmanager wrote it.
set -eu

width=$1
height=$2
density=$3
config="${ANDROID_AVD_HOME:-$HOME/.android/avd}/${AVD_NAME:-test}.avd/config.ini"
if [ ! -f "$config" ]; then
  echo "No emulator configuration at $config" >&2
  exit 1
fi

kept=$(grep -v -E '^(hw\.lcd\.width|hw\.lcd\.height|hw\.lcd\.density|skin\.name|skin\.path|showDeviceFrame)[ =]' "$config" || true)
{
  printf '%s\n' "$kept"
  echo "hw.lcd.width=$width"
  echo "hw.lcd.height=$height"
  echo "hw.lcd.density=$density"
  echo "skin.name=${width}x${height}"
  echo "skin.path=_no_skin"
  echo "showDeviceFrame=no"
} > "$config"
grep -E '^(hw\.lcd|skin|showDeviceFrame)' "$config"
