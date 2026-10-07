package xyz.bobbyprotocol.android.v18

/**
 * The one place a localized template gets its values. The catalogs (iOS and Android) write
 * placeholders as `{0}`, `{1}`: look the whole template up first, then fill it, so the words
 * around a number can change order from one language to the next.
 */
object V18Text {
    private val placeholder = Regex("\\{(\\d+)\\}")

    /**
     * Replaces `{n}` with `args[n]`. A placeholder without an argument stays as written, and a
     * value that itself looks like a placeholder is never filled again.
     */
    fun fill(template: String, vararg args: Any?): String {
        if (args.isEmpty()) return template
        return placeholder.replace(template) { match ->
            val index = match.groupValues[1].toIntOrNull()
            if (index != null && index < args.size && args[index] != null) args[index].toString() else match.value
        }
    }
}
