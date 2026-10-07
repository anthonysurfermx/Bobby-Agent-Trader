package xyz.bobbyprotocol.android.data

import org.junit.Assert.*
import org.junit.Test

class AuthGuardsTest {
    @Test fun pkceMatchesRfc7636TestVector() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            AuthGuards.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test fun exactCallbackAndAttemptStateAreRequired() {
        assertEquals("opaque", AuthGuards.callbackParameters("bobby://auth/callback?state=expected&code=opaque", "expected")?.get("code"))
        listOf(
            "https://auth/callback?state=expected&code=opaque",
            "bobby://evil/callback?state=expected&code=opaque",
            "bobby://auth/callback/extra?state=expected&code=opaque",
            "bobby://auth:80/callback?state=expected&code=opaque",
            "bobby://user@auth/callback?state=expected&code=opaque",
            "bobby://auth/callback?state=wrong&code=opaque",
            "bobby://auth/callback?state=expected&state=wrong&code=opaque",
            "bobby://auth/callback?state=expected&code=opaque#access_token=secret",
            "bobby://auth/callback?state=expected&access_token=secret",
        ).forEach { assertNull(it, AuthGuards.callbackParameters(it, "expected")) }
    }

    @Test fun onlyRelativeBobbyApiPathsAreAllowed() {
        assertTrue(AuthGuards.validApiPath("api/desk-debate"))
        assertTrue(AuthGuards.validApiPath("api/briefing?id=opaque"))
        assertTrue(AuthGuards.validApiPath("/api/progress"))
        listOf("https://evil/api/account", "//evil/api/account", "api/../account", "api/%2e%2e/account",
            "api/account#fragment", "api/account\nX-Header: bad", "auth/v1/token").forEach { assertFalse(it, AuthGuards.validApiPath(it)) }
    }
}
