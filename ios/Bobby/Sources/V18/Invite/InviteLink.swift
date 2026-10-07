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

    /// What a person typed or pasted: the eight characters (spaces ignored), a whole invitation
    /// link (with or without `https://`), or a message that carries one of them, such as the text
    /// the app itself shares (the pitch, "My invitation code: ABCD2345" and the link). Two different
    /// invitations in one text are nobody's invitation: nil.
    static func code(fromEntry raw: String) -> String? {
        guard raw.utf8.count <= 512 else { return nil }
        let words = raw.unicodeScalars
            .split(whereSeparator: { CharacterSet.whitespacesAndNewlines.contains($0) })
            .map { String(String.UnicodeScalarView($0)) }
        // The eight characters alone, however they were spaced.
        if let code = normalized(words.joined()) { return code }
        let bare = words.map { $0.trimmingCharacters(in: wrapping) }
        // An invitation link anywhere in the text.
        let linked = Set(bare.compactMap(code(inWord:)))
        if !linked.isEmpty { return linked.count == 1 ? linked.first : nil }
        // Otherwise one code standing alone among other words: in capitals as the app writes it,
        // or with a digit in it (an ordinary eight-letter word in a sentence is not a code).
        guard words.count > 1 else { return nil }
        let alone = Set(bare.filter { $0 == $0.uppercased() || $0.contains(where: \.isNumber) }.compactMap(normalized))
        return alone.count == 1 ? alone.first : nil
    }

    /// Punctuation a sentence or a chat bubble puts around a link or a code.
    private static let wrapping = CharacterSet(charactersIn: ".,;:!?()[]{}<>\"'«»“”‘’")

    /// One word that is, on its own, an invitation link. Without a scheme it must start with the
    /// site's own host (`bobbyprotocol.xyz/i/CODE`, as the invite sheet prints the link).
    private static func code(inWord word: String) -> String? {
        if word.contains(":") { return URL(string: word).flatMap(code(from:)) }
        let lower = word.lowercased()
        guard hosts.contains(where: { lower.hasPrefix($0 + "/") }) else { return nil }
        return URL(string: "https://" + word).flatMap(code(from:))
    }

    private static func code(inPath path: String, after prefix: String) -> String? {
        guard path.hasPrefix(prefix) else { return nil }
        var rest = path.dropFirst(prefix.count)
        if rest.hasSuffix("/") { rest = rest.dropLast() }
        return normalized(String(rest))
    }
}
