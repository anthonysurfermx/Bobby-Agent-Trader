package xyz.bobbyprotocol.android.platform

/** Recognition may finish while the finger is held; only an explicit release confirms its text. */
class DictationState {
    private enum class Phase { IDLE, HOLDING, AWAITING_FINAL }
    private var phase = Phase.IDLE
    private var latest = ""
    private var finished = false

    val isHolding: Boolean get() = phase == Phase.HOLDING
    val isActive: Boolean get() = phase != Phase.IDLE
    val isAwaitingFinal: Boolean get() = phase == Phase.AWAITING_FINAL
    val isRecognitionFinished: Boolean get() = finished

    fun start() {
        phase = Phase.HOLDING
        latest = ""
        finished = false
    }

    fun partial(text: String) {
        if (!isActive || finished) return
        latest = text.trim()
    }

    /** A missing final transcript retains the latest actual partial result for the release fallback. */
    fun result(text: String): String? {
        if (!isActive || finished) return null
        if (text.isNotBlank()) latest = text.trim()
        finished = true
        return if (isAwaitingFinal) deliver() else null
    }

    fun release(): String? {
        if (!isHolding) return null
        phase = Phase.AWAITING_FINAL
        return if (finished) deliver() else null
    }

    /** Call after the bounded finalization window; holding/background never confirms a question. */
    fun timeout(): String? = if (isAwaitingFinal) deliver() else null

    fun cancel() {
        phase = Phase.IDLE
        latest = ""
        finished = false
    }

    private fun deliver(): String = latest.also { cancel() }
}
