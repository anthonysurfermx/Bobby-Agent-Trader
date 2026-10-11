#!/usr/bin/env bash
# Set the whole disposable emulator's locale, including framework/IME strings, before tests launch.
set -eu
[ "${GITHUB_ACTIONS:-}" = true ] || { echo 'Device locale reset is CI-only.' >&2; exit 1; }
[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1 ] || { echo 'An emulator is required.' >&2; exit 1; }
case "$1" in
  en) device_locale=en-US ;; es) device_locale=es-MX ;; fr) device_locale=fr-FR ;;
  pt) device_locale=pt-BR ;; it) device_locale=it-IT ;; de) device_locale=de-DE ;;
  *) echo 'Unsupported release locale.' >&2; exit 1 ;;
esac
# A cold image can restart adbd just after boot; retry that transport transition,
# then still require actual root and the exact system locale before running a test.
locale_root_ready=false
for locale_root_attempt in $(seq 1 5); do
  adb wait-for-device
  if adb root; then
    adb wait-for-device
    if [ "$(adb shell id -u | tr -d '\r')" = 0 ]; then locale_root_ready=true; break; fi
  fi
  sleep 2
done
[ "$locale_root_ready" = true ] || { echo 'The disposable image must support adb root.' >&2; exit 1; }
adb shell settings put system system_locales "$device_locale"
adb shell setprop persist.sys.locale "$device_locale"
adb shell setprop sys.boot_completed 0
adb shell stop
sleep 5
adb shell start
for attempt in $(seq 1 90); do
  if [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; then break; fi
  sleep 2
done
[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] || { echo 'Locale restart did not finish.' >&2; exit 1; }
[ "$(adb shell getprop persist.sys.locale | tr -d '\r')" = "$device_locale" ] || exit 1
adb unroot
adb wait-for-device
adb shell input keyevent 82
echo "Disposable emulator system locale: $device_locale"
