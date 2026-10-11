#!/usr/bin/env bash
# Runs the instrumented tests on the emulator (or phone) adb already sees, and keeps what they leave
# behind in android/build/emulator: logcat, each part's report and results, and every screenshot a
# test saved on the device. CI calls it from .github/workflows/android-emulator.yml; by hand:
# `bash android/tools/run-emulator-tests.sh`. Extra arguments go to Gradle.
#
# Four parts, the ones that load the least first, so that an emulator that stops under the page
# (it has, on a runner without a GPU) costs the later parts and not the earlier ones:
#   screens  the 1.8 screens drawn over a staged account (no page, no activity of the app)
#   device   the real activity with its page: the profile, the permission question, a notice, a rotation
#   others   every other instrumented test
#   page     the bundled page kept running in a WebView while a read plays: the line on the glass, the row after a read
# The tests decide the result: a failed part fails this script after everything is collected.
set -u
cd "$(dirname "$0")/.."

build_type=${BOBBY_TEST_BUILD_TYPE:-Debug}
out=build/emulator
# Where a test saves a screenshot (V18Shots in app/src/androidTest): the shell may write there, and
# it outlives the app, which Gradle removes from the device when the tests end.
device_shots=/data/local/tmp/bobby-shots
screens=xyz.bobbyprotocol.android.v18.V18ScreensInstrumentedTest
device=xyz.bobbyprotocol.android.V18DeviceInstrumentedTest
page=xyz.bobbyprotocol.android.v18.FollowUpPageInstrumentedTest
argument=-Pandroid.testInstrumentationRunnerArguments

mkdir -p "$out/shots"
rm -f "$out/instrumentation-crash.txt"
if [ "${BOBBY_TEST_LOCALE:-suite}" != suite ]; then
  bash tools/set-emulator-locale.sh "$BOBBY_TEST_LOCALE" || exit 1
fi
adb shell mkdir -p "$device_shots"
# An emulator that draws in software sometimes shows "isn't responding" for its own launcher, over
# the screen being photographed: the system is asked not to show those windows.
adb shell settings put global hide_error_dialogs 1 || true
adb logcat -c || true
: > "$out/logcat.txt"
adb logcat -v threadtime > "$out/logcat.txt" 2>&1 &
logcat=$!

# Even cancellation or a dead instrumentation runner leaves its crash log and native captures.
collect() {
  adb pull "$device_shots/." "$out/shots" > /dev/null 2>&1 || true
  kill "$logcat" 2>/dev/null || true
}
trap collect EXIT

status=0
part() {
  if [ -f "$out/instrumentation-crash.txt" ]; then return; fi
  name=$1
  shift
  echo "==== Instrumented tests: $name ===="
  # A runner that crashes before JUnit starts can otherwise wait until the whole 90-minute job ends.
  log_start=$(( $(wc -c < "$out/logcat.txt") + 1 ))
  timeout --signal=TERM --kill-after=30s 15m ./gradlew :app:connected${build_type}AndroidTest --no-daemon "$@" &
  test_process=$!
  (
    while kill -0 "$test_process" 2>/dev/null; do
      if tail -c +"$log_start" "$out/logcat.txt" | grep -Fq 'AndroidRuntime: Process: xyz.bobbyprotocol.bobby,'; then
        echo "Bobby crashed in '$name'; preserving logcat and captures." | tee "$out/instrumentation-crash.txt"
        kill -TERM "$test_process" 2>/dev/null || true
        break
      fi
      sleep 2
    done
  ) &
  watchdog=$!
  wait "$test_process" || status=1
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  mkdir -p "$out/$name"
  cp -R app/build/reports/androidTests/connected "$out/$name/report" 2>/dev/null || true
  cp -R app/build/outputs/androidTest-results/connected "$out/$name/results" 2>/dev/null || true
  adb pull "$device_shots/." "$out/shots" > /dev/null 2>&1 || true
  # A screen test sets the system's font size and puts it back; if it was cut short, the next part still starts at 100%.
  adb shell settings put system font_scale 1.0 > /dev/null 2>&1 || true
  # An emulator that stopped says nothing itself: what the machine's kernel saw (it ran out of memory, it crashed) is printed.
  if ! adb get-state > /dev/null 2>&1; then
    echo "The emulator is gone after the part '$name'. What this machine's kernel says:"
    { sudo -n dmesg 2>/dev/null || dmesg 2>/dev/null || true; } | grep -i -E 'out of memory|killed process|segfault|general protection' | tail -8 || true
    free -m 2>/dev/null || true
  fi
}

if [ "${BOBBY_TEST_LOCALE:-suite}" != suite ]; then
  part locale "$argument.class=xyz.bobbyprotocol.android.ReleaseLocaleSmokeInstrumentedTest" "$argument.bobbyLocale=$BOBBY_TEST_LOCALE" "$@"
  python3 tools/check-locale-captures.py || status=1
else
  part screens "$argument.class=$screens" "$@"
  part device "$argument.class=$device" "$@"
  part others "$argument.notClass=$screens,$device,$page" "$@"
  part page "$argument.class=$page" "$@"
fi

kill "$logcat" 2>/dev/null || true
echo "Screenshots collected: $(find "$out/shots" -name '*.png' | wc -l | tr -d ' ')"
exit "$status"
