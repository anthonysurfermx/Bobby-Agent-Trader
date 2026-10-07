// Invitations (1.8): which URLs carry an invitation code. Pure: no state, no network.
//   https://bobbyprotocol.xyz/i/CODE            the shared link (universal link, also with www.)
//   https://bobbyprotocol.xyz/desk?ref=CODE     links already in circulation (1.5–1.7, web)
//   bobbyprotocol://invite/CODE                 the web invite page's "open in the app" button
// Everything else is not an invitation, in particular `bobbyprotocol://auth-callback…`, which
// belongs to sign-in (AccountSession) and never reaches this parser's callers as an invitation.
import Foundation

enum InviteLink {
    /// The server's alphabet: no I, O, 0 or 1 (api/_lib/referrals.ts).
    static let codePattern = #"^[A-HJ-NP-Z2-9]{8}$"#
    static let codeLength = 8
    static let hosts: Set<String> = ["bobbyprotocol.xyz", "www.bobbyprotocol.xyz"]
    static let appScheme = "bobbyprotocol"
    static let appHost = "invite"

    /// The code in capitals when `raw` is exactly eight characters of the alphabet, in either case.
    /// Both cases are spelled out: a case-insensitive match would also take look-alike letters.
    static func normalized(_ raw: String) -> String? {
        guard raw.utf8.count == codeLength,
              raw.range(of: #"^[A-HJ-NP-Za-hj-np-z2-9]{8}$"#, options: .regularExpression) != nil else { return nil }
        return raw.uppercased()
    }

    /// The invitation code a URL carries, or nil. The raw (still percent-encoded) path and query are
    /// read, so an encoded character is never decoded into a code.
    static func code(from url: URL) -> String? {
        guard url.absoluteString.utf8.count <= 2_048,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = parts.scheme?.lowercased(),
              parts.user == nil, parts.password == nil, parts.port == nil,
              let host = url.host(percentEncoded: true)?.lowercased() else { return nil }
        let path = parts.percentEncodedPath
        switch scheme {
        case "https":
            guard hosts.contains(host) else { return nil }
            if let code = code(inPath: path, after: "/i/") { return code }
            guard path == "/desk" || path == "/desk/" else { return nil }
            return parts.percentEncodedQueryItems?.first { $0.name == "ref" }?.value.flatMap(normalized)
        case appScheme:
            guard host == appHost else { return nil }
            return code(inPath: path, after: "/")
        default:
            return nil
        }
    }

    /// What a person typed or pasted: the eight characters (spaces ignored), or a whole invitation link.
    static func code(fromEntry raw: String) -> String? {
        guard raw.utf8.count <= 512 else { return nil }
        let text = String(String.UnicodeScalarView(raw.unicodeScalars.filter {
            !CharacterSet.whitespacesAndNewlines.contains($0)
        }))
        if let code = normalized(text) { return code }
        guard text.contains(":"), let url = URL(string: text) else { return nil }
        return code(from: url)
    }

    private static func code(inPath path: String, after prefix: String) -> String? {
        guard path.hasPrefix(prefix) else { return nil }
        var rest = path.dropFirst(prefix.count)
        if rest.hasSuffix("/") { rest = rest.dropLast() }
        return normalized(String(rest))
    }
}
