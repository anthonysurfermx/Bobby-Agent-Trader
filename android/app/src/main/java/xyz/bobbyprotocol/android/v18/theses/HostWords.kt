package xyz.bobbyprotocol.android.v18.theses

import xyz.bobbyprotocol.android.v18.V18Host

/**
 * The app's words and its locale, which is all a pure 1.8 class needs of the host. Everything that
 * words a thesis or what Bobby remembers takes one of these, so its unit tests can run it in each of
 * the six languages against the real catalogs without a session.
 */
interface HostWords {
    /** English and Spanish as written at the call site; `{0}`, `{1}` are filled after localizing. */
    fun text(en: String, es: String, vararg args: Any?): String
    /** For numbers and dates: `en-US`, `es-MX`, `de-DE`… */
    val locale: String
}

/** The words of the running app. */
class V18HostWords(private val host: V18Host) : HostWords {
    override fun text(en: String, es: String, vararg args: Any?): String = host.text(en, es, *args)
    override val locale: String get() = host.locale
}
