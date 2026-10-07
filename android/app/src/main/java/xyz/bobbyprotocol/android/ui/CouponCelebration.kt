package xyz.bobbyprotocol.android.ui

// Animation proposed by Claude CLI; integrated and verified locally.
import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import kotlin.math.*

private val Bg = Color(0xFF08080C); private val Cream = Color(0xFFF2EBDF)
private val Violet = Color(0xFFAC86EF); private val Blue = Color(0xFF6A92EC)
private val Palette = listOf(Violet, Cream, Blue)
private fun seg(p: Float, a: Float, b: Float): Float {
    val k = 1f - ((p - a) / (b - a)).coerceIn(0f, 1f); return 1f - k * k * k // Cubic ease-out
}

@Composable
fun CouponCelebration(reduceMotion: Boolean = false, modifier: Modifier = Modifier) {
    val still = reduceMotion || rememberCouponSystemReducedMotion()
    val progress = remember { Animatable(0f) }
    LaunchedEffect(still) { // Cancels automatically when leaving composition
        if (still) progress.snapTo(1f) // Respect changes immediately and never replay this receipt.
        else if (progress.value < 1f) progress.animateTo(1f, tween(1200, easing = LinearEasing))
    }
    Box(modifier.size(120.dp).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val p = if (still) 1f else progress.value // Read during drawing
            val u = size.minDimension / 120f
            val ring = seg(p, 0f, .6f); val burst = seg(p, .1f, .85f); val check = seg(p, .25f, .6f)
            val orb = Brush.linearGradient(listOf(Violet, Blue))
            drawCircle(Brush.radialGradient(listOf(Violet.copy(alpha = .2f + .3f * check), Blue.copy(alpha = .12f),
                Color.Transparent), center, 58f * u), 58f * u)
            drawCircle(orb, (16f + 36f * ring) * u, alpha = 1f - .65f * ring, style = Stroke((3f - 1.5f * ring) * u))
            if (!still && burst > 0f && burst < 1f) repeat(16) { i -> // Deterministic particle directions
                val a = i * (PI.toFloat() / 8f) + if (i % 2 == 0) 0f else .12f
                val d = (12f + (26f + (i * 7 % 5) * 3f) * burst) * u
                val s = (if (i % 3 == 0) 5f else 3.5f) * u * (1f - .4f * burst)
                val o = center + Offset(cos(a) * d, sin(a) * d)
                val alpha = min(1f, burst * 8f) * (1f - burst * burst * burst)
                rotate(Math.toDegrees((a + burst * 2f).toDouble()).toFloat(), o) {
                    when (i % 3) {
                        0 -> drawRect(Palette[0], o - Offset(s / 2, s / 2), Size(s, s), alpha)
                        1 -> drawCircle(Palette[1], s / 2, o, alpha)
                        else -> drawPath(Path().apply {
                            moveTo(o.x, o.y - s / 2); lineTo(o.x + s / 2, o.y + s / 2); lineTo(o.x - s / 2, o.y + s / 2); close()
                        }, Palette[2], alpha)
                    }
                }
            }
            drawCircle(orb, 22f * u * (.7f + .3f * seg(p, 0f, .3f))) // Core
            val checkScale = .6f + .4f * check + .12f * sin(check * PI.toFloat())
            scale(checkScale, checkScale, center) {
                drawPath(Path().apply {
                    moveTo(center.x - 8f * u, center.y)
                    lineTo(center.x - 2f * u, center.y + 7f * u)
                    lineTo(center.x + 10f * u, center.y - 8f * u)
                }, Cream, alpha = check, style = Stroke(3f * u, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }

    }
}

/** Observe the real system policy, including changes while a receipt remains visible. */
@Composable
internal fun rememberCouponSystemReducedMotion(): Boolean {
    val context = LocalContext.current
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    fun systemReducedMotion() = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    var systemStill by remember(context) { mutableStateOf(systemReducedMotion()) }
    DisposableEffect(context, lifecycleOwner) {
        val observer = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { systemStill = systemReducedMotion() }
        }
        val listener = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) systemStill = systemReducedMotion()
        }
        context.contentResolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        lifecycleOwner.lifecycle.addObserver(listener)
        onDispose { context.contentResolver.unregisterContentObserver(observer); lifecycleOwner.lifecycle.removeObserver(listener) }
    }
    return systemStill
}
