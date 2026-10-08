package xyz.bobbyprotocol.android.v18.invite

import java.util.Locale

// Invitations (1.8): which URLs carry an invitation code. A port of
// ios/Bobby/Sources/V18/Invite/InviteLink.swift. Pure: no state, no network, no Android classes.
//   https://bobbyprotocol.xyz/i/CODE            the shared link (an Android App Link, also with www.)
//   https://bobbyprotocol.xyz/desk?ref=CODE     links already in circulation (web)
//   bobbyprotocol://invite/CODE                 the web invite page's "open in the app" form
// Everything else is not an invitation, in particular the sign-in callback (`bobby://auth/callback`),
// which belongs to sign-in and never reaches this parser's callers as an invitation.
object InviteLink {
    /** The server's alphabet: no I, O, 0 or 1 (api/_lib/referrals.ts). */
    val CODE_PATTERN = Regex("^[A-HJ-NP-Z2-9]{8}$")
    const val CODE_LENGTH = 8
    val HOSTS: Set<String> = setOf("bobbyprotocol.xyz", "www.bobbyprotocol.xyz")
    const val APP_SCHEME = "bobbyprotocol"
    const val APP_HOST = "invite"

    /** Both cases are spelled out: a case-insensitive match would also take look-alike letters. */
    private val EITHER_CASE = Regex("^[A-HJ-NP-Za-hj-np-z2-9]{8}$")
    private val SCHEME = Regex("^[A-Za-z][A-Za-z0-9+.-]*$")
    /** Punctuation a sentence or a chat bubble puts around a link or a code. */
    private const val WRAPPING = ".,;:!?()[]{}<>\"'«»“”‘’"

    /** The code in capitals when `raw` is exactly eight characters of the alphabet, in either case. */
    fun normalized(raw: String): String? {
        if (raw.toByteArray(Charsets.UTF_8).size != CODE_LENGTH || !EITHER_CASE.matches(raw)) return null
        return raw.uppercase(Locale.ROOT)
    }

    /**
     * The invitation code a URL carries, or null. The raw (still percent-encoded) path and query
     * are read, so an encoded character is never decoded into a code.
     */
    fun code(url: String): String? {
        if (url.toByteArray(Charsets.UTF_8).size > 2_048) return null
        val colon = url.indexOf(':')
        if (colon <= 0) return null
        val rawScheme = url.substring(0, colon)
        if (!SCHEME.matches(rawScheme)) return null
        val scheme = rawScheme.lowercase(Locale.ROOT)
        val rest = url.substring(colon + 1)
        // Both forms have an authority: `scheme:path` without `//` has no host.
        if (!rest.startsWith("//")) return null
        val afterSlashes = rest.substring(2)
        val authorityEnd = afterSlashes.indexOfFirst { it == '/' || it == '?' || it == '#' }.let { if (it < 0) afterSlashes.length else it }
        val authority = afterSlashes.substring(0, authorityEnd)
        // No user, no password, no port; and a host that is not plain ASCII is nobody's host here.
        if (authority.isEmpty() || authority.any { it == '@' || it == ':' || it.code > 127 }) return null
        val host = authority.lowercase(Locale.ROOT)
        val tail = afterSlashes.substring(authorityEnd).substringBefore('#')
        val path = tail.substringBefore('?')
        val query = if (tail.contains('?')) tail.substringAfter('?') else null
        return when (scheme) {
            "https" -> {
                if (host !in HOSTS) return null
                codeInPath(path, "/i/")?.let { return it }
                if (path != "/desk" && path != "/desk/") return null
                // The first item named exactly `ref` decides, as it does for the server.
                val ref = query?.split('&')?.firstOrNull { it.substringBefore('=') == "ref" } ?: return null
                if (!ref.contains('=')) return null
                normalized(ref.substringAfter('='))
            }
            APP_SCHEME -> if (host == APP_HOST) codeInPath(path, "/") else null
            else -> null
        }
    }

    /**
     * What a person typed or pasted: the eight characters (spaces ignored), a whole invitation
     * link (with or without `https://`), or a message that carries one of them, such as the text
     * the app itself shares (the pitch, "My invitation code: ABCD2345" and the link). Two different
     * invitations in one text are nobody's invitation: null.
     */
    fun codeFromEntry(raw: String): String? {
        if (raw.toByteArray(Charsets.UTF_8).size > 512) return null
        val words = raw.split(Regex("[\\s\\p{Z}\\u0085]+")).filter { it.isNotEmpty() }
        // The eight characters alone, however they were spaced.
        normalized(words.joinToString(""))?.let { return it }
        val bare = words.map { word -> word.trim { it in WRAPPING } }
        // An invitation link anywhere in the text.
        val linked = bare.mapNotNull { codeInWord(it) }.toSet()
        if (linked.isNotEmpty()) return if (linked.size == 1) linked.first() else null
        // Otherwise one code standing alone among other words: in capitals as the app writes it,
        // or with a digit in it (an ordinary eight-letter word in a sentence is not a code).
        if (words.size <= 1) return null
        val alone = bare.filter { word -> word == word.uppercase(Locale.ROOT) || word.any { it.isDigit() } }.mapNotNull { normalized(it) }.toSet()
        return if (alone.size == 1) alone.first() else null
    }

    /**
     * The code field as it is typed: capitals and eight characters at most; a pasted invitation
     * link, or the whole message the app shares, becomes its code.
     */
    fun tidy(typed: String): String {
        if (typed.length > CODE_LENGTH) codeFromEntry(typed)?.let { return it }
        return typed.uppercase(Locale.ROOT).filter { it in 'A'..'Z' || it in '0'..'9' }.take(CODE_LENGTH)
    }

    /**
     * One word that is, on its own, an invitation link. Without a scheme it must start with the
     * site's own host (`bobbyprotocol.xyz/i/CODE`, as the link is often written).
     */
    private fun codeInWord(word: String): String? {
        if (word.contains(':')) return code(word)
        val lower = word.lowercase(Locale.ROOT)
        if (HOSTS.none { lower.startsWith("$it/") }) return null
        return code("https://$word")
    }

    private fun codeInPath(path: String, prefix: String): String? {
        if (!path.startsWith(prefix)) return null
        var rest = path.substring(prefix.length)
        if (rest.endsWith("/")) rest = rest.dropLast(1)
        return normalized(rest)
    }
}
