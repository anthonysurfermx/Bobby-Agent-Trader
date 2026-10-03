package xyz.bobbyprotocol.android.platform

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import java.io.File
import java.util.UUID

data class AvatarShareGear(val art: String, val label: String)
data class AvatarShareSpec(val companionId: String, val displayName: String, val levelLabel: String,
                           val levelNumber: Int, val xp: Int, val ownedGear: Int, val totalGear: Int,
                           val gear: List<AvatarShareGear>)

/** Local card with the approved companion art and currently earned gear; contains no account identifiers. */
object AvatarShareCard {
    private val companion = Regex("^[a-z][a-z0-9_-]{0,31}$")
    private val gearArt = Regex("^(?:tool_[a-z]+_[123]|pet_[a-z]+)\\.png$")

    fun create(context: Context, spec: AvatarShareSpec): File {
        require(companion.matches(spec.companionId) && spec.levelNumber in 1..100 && spec.xp >= 0)
        require(spec.ownedGear in 0..spec.totalGear && spec.totalGear in 0..1000 && spec.gear.size <= 3)
        require(spec.displayName.length in 1..80 && spec.levelLabel.length in 1..120)
        require(spec.gear.all { gearArt.matches(it.art) && it.label.length in 1..80 })
        val directory = File(context.cacheDir, "avatar-share").apply { mkdirs() }
        // Generated cards contain only public artwork/progress. Bound our own disposable cache.
        directory.listFiles()?.filter { it.isFile && it.name.matches(Regex("[a-f0-9-]{36}\\.png")) }
            ?.sortedByDescending { it.lastModified() }?.drop(4)?.forEach { it.delete() }
        val file = File(directory, UUID.randomUUID().toString() + ".png")
        val bitmap = Bitmap.createBitmap(1080, 1440, Bitmap.Config.ARGB_8888)
        try {
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val cream = Color.rgb(242, 237, 228)
            val violet = Color.rgb(180, 159, 247)
            canvas.drawColor(Color.rgb(7, 6, 15))
            paint.shader = RadialGradient(540f, 460f, 600f, intArrayOf(Color.rgb(48, 32, 76), Color.rgb(7, 6, 15)), null, Shader.TileMode.CLAMP)
            canvas.drawRect(0f, 0f, 1080f, 1100f, paint)
            paint.shader = null
            fun text(value: String, y: Float, size: Float, color: Int, bold: Boolean = false) {
                paint.color = color; paint.textSize = size; paint.textAlign = Paint.Align.CENTER
                paint.typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
                val clean = value.replace(Regex("[\\r\\n\\t]"), " ").trim()
                var shown = clean
                while (shown.isNotEmpty() && paint.measureText(shown) > 920f) shown = shown.dropLast(1)
                if (shown != clean && shown.isNotEmpty()) shown = shown.dropLast(1) + "…"
                canvas.drawText(shown, 540f, y, paint)
            }
            text("BOBBY", 70f, 36f, violet, true)
            val portrait = context.assets.open("equipment/" + spec.companionId + "_thumb.png").use(BitmapFactory::decodeStream)
                ?: error("Companion artwork is unavailable")
            try {
                val scale = minOf(760f / portrait.width, 680f / portrait.height)
                val width = portrait.width * scale; val height = portrait.height * scale
                canvas.drawBitmap(portrait, null, RectF(540f - width / 2, 430f - height / 2, 540f + width / 2, 430f + height / 2), paint)
            } finally { portrait.recycle() }
            text(spec.displayName, 860f, 70f, cream, true)
            text(spec.levelLabel + " · " + spec.levelNumber + " · " + spec.xp + " XP", 925f, 32f, violet)
            text(spec.ownedGear.toString() + " / " + spec.totalGear, 980f, 24f, cream)
            spec.gear.forEachIndexed { index, gear ->
                val x = 540f + (index - (spec.gear.size - 1) / 2f) * 280f
                val art = context.assets.open("equipment/" + gear.art).use(BitmapFactory::decodeStream)
                    ?: error("Gear artwork is unavailable")
                try { canvas.drawBitmap(art, null, RectF(x - 95, 1030f, x + 95, 1220f), paint) }
                finally { art.recycle() }
                paint.color = cream; paint.textSize = 22f; paint.textAlign = Paint.Align.CENTER
                var label = gear.label.replace(Regex("[\\r\\n\\t]"), " ").trim()
                while (label.isNotEmpty() && paint.measureText(label) > 250f) label = label.dropLast(1)
                canvas.drawText(label, x, 1255f, paint)
            }
            text("bobbyprotocol.xyz", 1380f, 24f, Color.rgb(160, 151, 180))
            file.outputStream().use { require(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
            return file
        } catch (error: Throwable) { file.delete(); throw error }
        finally { bitmap.recycle() }
    }
}
