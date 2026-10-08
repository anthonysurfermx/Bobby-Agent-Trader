package xyz.bobbyprotocol.android.v18

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What MainActivity does with the intent it is handed. Android only: on iPhone a link or a tapped
 * notification is delivered once and the system never hands it back.
 */
class LaunchIntentTest {
    @Test fun theIntentThatStartedTheActivityIsHonouredOnceNeverWhenTheSystemRebuildsIt() {
        assertTrue("a cold start from a link, a notice or the sign-in callback", LaunchIntent.isFirstDelivery(restored = false))
        // A rotation the activity does not handle itself, or a process Android killed and now restores:
        // onCreate is handed the very intent that started the activity the first time, link and extra included.
        assertFalse("an accepted invitation is not claimed again, a review does not open by itself",
                    LaunchIntent.isFirstDelivery(restored = true))
    }

    @Test fun aTaskRebuiltFromRecentsIsNotThePersonsTap() {
        assertTrue(LaunchIntent.isPersonsTap(fromHistory = false))
        assertFalse(LaunchIntent.isPersonsTap(fromHistory = true))
    }

    @Test fun onlyAnInvitationPathIsForwardedFromALinkThatOpenedTheApp() {
        assertTrue(LaunchIntent.isInvitationPath("/i/ABCD2345"))
        assertTrue("with a trailing slash too; the invitation parser judges the code", LaunchIntent.isInvitationPath("/i/ABCD2345/"))
        for (path in listOf(null, "", "/", "/i", "/i/", "/desk", "/desk?ref=ABCD2345", "/I/ABCD2345", "/admin", "/invite/ABCD2345", "i/ABCD2345")) {
            assertFalse("not a path the manifest opens: $path", LaunchIntent.isInvitationPath(path))
        }
    }
}
