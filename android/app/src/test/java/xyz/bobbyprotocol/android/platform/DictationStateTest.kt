package xyz.bobbyprotocol.android.platform

import org.junit.Assert.*
import org.junit.Test

class DictationStateTest {
    @Test fun `automatic completion keeps logical hold and confirms only on release`() {
        val state = DictationState()
        state.start()
        state.partial("BTC")
        assertNull(state.result(" BTC para mañana? "))
        assertTrue(state.isHolding)
        assertTrue(state.isActive)
        assertTrue(state.isRecognitionFinished)
        assertFalse(state.isAwaitingFinal)
        state.partial("late text must not overwrite settled transcript")
        assertNull(state.result("second callback"))
        assertNull(state.timeout())
        assertEquals("BTC para mañana?", state.release())
        assertFalse(state.isActive)
        assertNull(state.release())
        assertNull(state.result("late final"))
    }

    @Test fun `release before final waits and delivers the actual final once`() {
        val state = DictationState()
        state.start()
        state.partial("Tesla")
        assertNull(state.release())
        assertTrue(state.isAwaitingFinal)
        assertFalse(state.isHolding)
        assertTrue(state.isActive)
        assertEquals("Tesla esta semana?", state.result("Tesla esta semana?"))
        assertFalse(state.isActive)
        assertNull(state.timeout())
        assertNull(state.result("duplicate"))
    }

    @Test fun `bounded final timeout confirms latest recognized partial only after release`() {
        val state = DictationState()
        state.start()
        state.partial(" Ethereum ")
        assertNull(state.timeout())
        assertNull(state.release())
        assertEquals("Ethereum", state.timeout())
        assertNull(state.timeout())
        state.start()
        assertNull(state.release())
        assertEquals("", state.timeout())
    }

    @Test fun `background cancellation discards held and awaiting finals`() {
        val state = DictationState()
        state.start()
        state.result("never send this background question")
        state.cancel()
        assertFalse(state.isActive)
        assertFalse(state.isRecognitionFinished)
        state.partial("late callback")
        assertNull(state.result("late final"))
        assertNull(state.release())
        assertNull(state.timeout())
        state.start()
        state.partial("also discard released capture")
        state.release()
        state.cancel()
        assertNull(state.result("late final after background"))
        assertNull(state.timeout())
    }

    @Test fun `new capture never inherits text after cancellation or restart`() {
        val state = DictationState()
        state.start()
        state.partial("previous account")
        state.cancel()
        state.start()
        assertNull(state.release())
        assertEquals("", state.timeout())
        state.start()
        state.partial("old hold")
        state.start()
        assertNull(state.release())
        assertEquals("new hold", state.result("new hold"))
    }

    @Test fun `missing final text uses recognized partial and an empty capture stays empty`() {
        val state = DictationState()
        state.start()
        state.partial("NVDA?")
        assertNull(state.result(""))
        assertEquals("NVDA?", state.release())
        state.start()
        assertNull(state.result(""))
        assertEquals("", state.release())
    }
}
