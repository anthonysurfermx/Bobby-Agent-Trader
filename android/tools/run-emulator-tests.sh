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

out=build/emulator
# Where a test saves a screenshot (V18Shots in app/src/androidTest): the shell may write there, and
# it outlives the app, which Gradle removes from the device when the tests end.
device_shots=/data/local/tmp/bobby-shots
screens=xyz.bobbyprotocol.android.v18.V18ScreensInstrumentedTest
device=xyz.bobbyprotocol.android.V18DeviceInstrumentedTest
page=xyz.bobbyprotocol.android.v18.FollowUpPageInstrumentedTest
argument=-Pandroid.testInstrumentationRunnerArguments

mkdir -p "$out/shots"
adb shell mkdir -p "$device_shots"
# An emulator that draws in software sometimes shows "isn't responding" for its own launcher, over
# the screen being photographed: the system is asked not to show those windows.
adb shell settings put global hide_error_dialogs 1 || true
adb logcat -c || true
adb logcat -v threadtime > "$out/logcat.txt" 2>&1 &
logcat=$!

status=0
part() {
  name=$1
  shift
  echo "==== Instrumented tests: $name ===="
  ./gradlew :app:connectedDebugAndroidTest --no-daemon "$@" || status=1
  mkdir -p "$out/$name"
  cp -R app/build/reports/androidTests/connected "$out/$name/report" 2>/dev/null || true
  cp -R app/build/outputs/androidTest-results/connected "$out/$name/results" 2>/dev/null || true
  adb pull "$device_shots/." "$out/shots" > /dev/null 2>&1 || true
  # A screen test sets the system's font size and puts it back; if it was cut short, the next part still starts at 100%.
  adb shell settings put system font_scale 1.0 > /dev/null 2>&1 || true
}

part screens "$argument.class=$screens" "$@"
part device "$argument.class=$device" "$@"
part others "$argument.notClass=$screens,$device,$page" "$@"
part page "$argument.class=$page" "$@"

kill "$logcat" 2>/dev/null || true
echo "Screenshots collected: $(find "$out/shots" -name '*.png' | wc -l | tr -d ' ')"
exit "$status"
