"""Run the unchanged pure iOS guard tests on macOS, without a simulator.

This checks guard logic only, not app lifecycle, Reown transport or device signing.
Usage: python3 scripts/test-ios-stock-guards.py /path/to/ios/Bobby
"""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ios = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix="bobby-stock-guards-") as directory:
    root = Path(directory)
    source = root / "Sources/Bobby"
    tests = root / "Tests/BobbyTests"
    source.mkdir(parents=True)
    tests.mkdir(parents=True)
    (root / "Package.swift").write_text('''// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "BobbyGuards", platforms: [.macOS(.v13)], targets: [
    .target(name: "Bobby"), .testTarget(name: "BobbyTests", dependencies: ["Bobby"])
])
''')
    swap = (ios / "Sources/BaseSwap.swift").read_text()
    assert swap.count("enum BaseSwapAPIError:") == 1
    (source / "BaseSwap.swift").write_text(swap.split("enum BaseSwapAPIError:")[0])
    wallet = (ios / "Sources/WalletBridge.swift").read_text()
    assert wallet.count("enum BobbyWalletSessionValidator {") == 1
    validator = "struct BobbyWalletSession:" + wallet.split("struct BobbyWalletSession:", 1)[1].split("enum WalletBridgeError:", 1)[0]
    coders = "extension JSONDecoder {" + wallet.split("extension JSONDecoder {", 1)[1]
    (source / "WalletSessionValidator.swift").write_text("import Foundation\n" + validator + coders)
    shutil.copyfile(ios / "Sources/RPCCorrelator.swift", source / "RPCCorrelator.swift")
    # Only localization is substituted; all validation code and test bodies are copied verbatim.
    (source / "Localization.swift").write_text('enum L { static func t(_ en: String, _ es: String) -> String { en } }\n')
    for name in ["BaseSwapGuardTests.swift", "RPCCorrelatorTests.swift", "WalletSessionValidatorTests.swift"]:
        shutil.copyfile(ios / "Tests" / name, tests / name)
    result = subprocess.run(["swift", "test", "--package-path", str(root)])
    sys.exit(result.returncode)
