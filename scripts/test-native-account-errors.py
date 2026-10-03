#!/usr/bin/env python3
"""Compile real native error mappers and catalog offline; unknown server copy stays out of UI."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def function(source, marker):
    start = source.index(marker)
    index = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[index] == "{") - (source[index] == "}")
        index += 1
    return source[start:index]


localization = (ROOT / "ios/Bobby/Sources/Localization.swift").read_text()
text_type = localization[localization.index("struct LocalizedText:"):localization.index("enum L {")]
t = function(localization, "static func t(_ en: LocalizedText,")
account = function((ROOT / "ios/Bobby/Sources/AccountSession.swift").read_text(), "private func fail(data:")
land = function((ROOT / "ios/Bobby/Sources/TraderLandSync.swift").read_text(), "nonisolated static func failure(status:").replace("nonisolated ", "")
swift = r'''
import Foundation
__TEXT_TYPE__
enum L {
    static var language = "it"
    __TRANSLATE__
    static func t(_ en: String, _ es: String, spanish: Bool? = nil) -> String { t(LocalizedText(en), es, spanish: spanish) }
}
enum AccountDeletion { case failed }
final class Account {
    var lastError: String?
    func interrupted() -> AccountDeletion {
        lastError = L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta")
        return .failed
    }
    __ACCOUNT__
    func simulate(_ data: Data, status: Int) { _ = fail(data: data, status: status) }
}
enum Land { __LAND__ }
func require(_ value: Bool, _ label: String) {
    if !value { FileHandle.standardError.write(Data(("FAIL: " + label + "\n").utf8)); exit(1) }
}
let unknown = "Account deletion is temporarily unavailable"
let payload = Data(("{\"error\":\"" + unknown + "\"}").utf8)
let account = Account()
account.simulate(payload, status: 503)
require(account.lastError != unknown, "Italian deletion failure must not display the unknown English API message")
var checks = 1
let known: [(Int, String)] = [
    (422, "Choose a respectful island name without links or contact details."),
    (503, "Name review is temporarily unavailable. Try again."),
    (403, "Publishing is restricted. Contact Bobby support."),
    (409, "This piece already bloomed"), (409, "The market has not had time to answer yet"),
    (409, "This seed already bloomed"), (409, "Its review is already open"),
    (400, "A horizon can only grow"), (400, "Outside the island")
]
for language in ["en", "es", "fr", "pt", "it", "de"] {
    L.language = language
    for status in [400, 403, 422, 500, 502, 503] {
        account.simulate(payload, status: status)
        let expected = L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
        require(account.lastError == expected, language + " deletion context remains local at " + String(status))
        require(!account.lastError!.contains(unknown), language + " rejects unknown server prose")
        checks += 2
    }
    account.simulate(payload, status: 401)
    require(account.lastError == L.t("Sign in again before deleting your account", "Inicia sesión de nuevo antes de borrar tu cuenta"), language + " 401 retains reauthentication guidance")
    let fallback = Land.failure(status: 500, serverError: "RAW UNTRUSTED ENGLISH <script>")
    require(fallback == L.t("Your island could not be updated. Reload to check its saved state.", "No se pudo actualizar tu isla. Recarga para comprobar su estado guardado."), language + " island keeps localized unknown-error fallback")
    for (status, message) in known {
        require(Land.failure(status: status, serverError: message) != fallback, language + " island keeps known specific refusal: " + message)
        checks += 1
    }
    for status in [401, 404, 409] {
        require(!Land.failure(status: status, serverError: "RAW UNTRUSTED ENGLISH").contains("RAW"), language + " island never passes raw message")
        checks += 1
    }
    checks += 2
}
print("\(checks) actual Swift account/land error mapper and catalog checks passed (offline).")
'''.replace("__TEXT_TYPE__", text_type).replace("__TRANSLATE__", t).replace("__ACCOUNT__", account).replace("__LAND__", land)
with tempfile.TemporaryDirectory(prefix="bobby-account-locale-") as directory:
    path = Path(directory)
    (path / "main.swift").write_text(swift)
    subprocess.run(["swiftc", "-module-cache-path", str(path / "modules"), str(path / "main.swift"), str(ROOT / "ios/Bobby/Sources/NativeTranslations.swift"), "-o", str(path / "errors")], check=True)
    subprocess.run([str(path / "errors")], check=True)
