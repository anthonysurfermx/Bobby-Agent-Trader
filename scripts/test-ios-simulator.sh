#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# A new result directory keeps earlier evidence intact on local reruns.
result_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/bobby-ios-tests.XXXXXX")
simulator_id=${BOBBY_IOS_SIMULATOR_ID:-}
if [[ -z "$simulator_id" ]]; then
  sdk_version=$(xcrun --sdk iphonesimulator --show-sdk-version)
  simulator_id=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
runtime_suffix = ".iOS-" + "-".join(sys.argv[1].split(".")[:2])
for runtime in sorted(devices, reverse=True):
    if not (runtime.endswith(runtime_suffix) or runtime_suffix + "-" in runtime):
        continue
    for device in devices[runtime]:
        if device.get("isAvailable") and device["name"].startswith("iPhone"):
            print(device["udid"])
            sys.exit(0)
sys.exit("No compatible iPhone simulator; native tests cannot be skipped.")
' "$sdk_version")
fi

xcodebuild -version
xcodegen --version
xcodegen generate --spec ios/Bobby/project.yml
resolution_dir=ios/Bobby/Bobby.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
mkdir -p "$resolution_dir"
cp ios/Bobby/Package.resolved "$resolution_dir/Package.resolved"
set --
if [[ -n "${BOBBY_IOS_PACKAGES_DIR:-}" ]]; then
  set -- -clonedSourcePackagesDirPath "$BOBBY_IOS_PACKAGES_DIR"
fi
xcodebuild test -project ios/Bobby/Bobby.xcodeproj -scheme Bobby \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -parallel-testing-enabled NO -only-testing:BobbyTests \
  -onlyUsePackageVersionsFromResolvedFile \
  -derivedDataPath "${BOBBY_IOS_DERIVED_DATA:-$result_dir/DerivedData}" \
  -resultBundlePath "$result_dir/BobbyTests.xcresult" \
  "$@" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
xcrun xcresulttool get test-results summary \
  --path "$result_dir/BobbyTests.xcresult" > "$result_dir/summary.json"
python3 - "$result_dir/summary.json" <<'PY'
import json, sys
with open(sys.argv[1]) as source:
    summary = json.load(source)
passed = summary.get("passedTests", 0)
failed = summary.get("failedTests", 0)
if passed <= 0 or failed or summary.get("testFailures"):
    sys.exit("Native test evidence is missing or contains failures.")
print(f"Native app-hosted tests: {passed} passed, {failed} failed.")
PY
printf 'Native evidence: %s\n' "$result_dir/summary.json"
