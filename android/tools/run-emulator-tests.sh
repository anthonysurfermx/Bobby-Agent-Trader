#!/usr/bin/env bash
# Runs the instrumented tests on the emulator (or phone) adb already sees, and keeps what they leave
# behind in android/build/emulator: logcat, and every screenshot a test saved on the device.
# CI calls it from .github/workflows/android-emulator.yml; by hand: `bash android/tools/run-emulator-tests.sh`.
# The tests still decide the result: a failed test fails this script after the files are collected.
set -u
cd "$(dirname "$0")/.."

out=build/emulator
# Where a test saves a screenshot (V18Shots in app/src/androidTest): the shell may write there, and
# it outlives the app, which Gradle removes from the device when the tests end.
device_shots=/data/local/tmp/bobby-shots

mkdir -p "$out/shots"
adb shell mkdir -p "$device_shots"
adb logcat -c || true
adb logcat -v threadtime > "$out/logcat.txt" 2>&1 &
logcat=$!

./gradlew :app:connectedDebugAndroidTest --no-daemon "$@"
status=$?

adb pull "$device_shots/." "$out/shots" || true
kill "$logcat" 2>/dev/null || true
echo "Screenshots collected: $(find "$out/shots" -name '*.png' | wc -l | tr -d ' ')"
exit "$status"
