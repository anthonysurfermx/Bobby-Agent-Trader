package xyz.bobbyprotocol.android.push

import android.content.Context
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.SecureStore
import java.security.MessageDigest
import java.util.UUID

internal class PushBinding(
    val owner: String, val epoch: Long, val id: String, val revision: Long,
    val proof: String, val fidHash: String, val project: String, val syncedAt: Long,
) {
    fun json(): JSONObject = JSONObject().put("owner", owner).put("epoch", epoch).put("id", id).put("revision", revision)
        .put("proof", proof).put("fidHash", fidHash).put("project", project).put("syncedAt", syncedAt)
    override fun toString(): String = "PushBinding(redacted)"
}

/** The app persists only a target hash; raw FID callbacks remain in memory. */
internal class PushStore(context: Context) {
    private val store = SecureStore(context.applicationContext)
    fun binding(): PushBinding? = runCatching {
        val j = JSONObject(store.read("push.binding") ?: return null)
        val id = j.getString("id"); val revision = j.getLong("revision"); val proof = j.getString("proof")
        if (!PushPolicy.validUuid(id) || revision <= 0 || !proof.matches(Regex("[A-Za-z0-9_-]{43}"))) return null
        PushBinding(j.getString("owner"), j.getLong("epoch"), id, revision, proof, j.getString("fidHash"),
            j.getString("project"), j.getLong("syncedAt"))
    }.getOrNull()

    fun bind(binding: PushBinding) = store.writeMany(mapOf("push.binding" to binding.json().toString()), setOf("push.pending"))
    fun drop(binding: PushBinding) {
        val current = this.binding() ?: return
        if (current.id == binding.id && current.revision == binding.revision && current.owner == binding.owner) {
            store.writeMany(emptyMap(), setOf("push.binding", "push.pending"))
        }
    }
    fun forget(owner: String) { binding()?.takeIf { it.owner == owner }?.let(::drop) }

    fun operationKey(owner: String, digest: String): String {
        val pending = store.read("push.pending")?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (pending != null && pending.optString("owner") == owner && pending.optString("digest") == digest) {
            pending.optString("key").takeIf(PushPolicy::validUuid)?.let { return it }
        }
        val key = UUID.randomUUID().toString()
        store.write("push.pending", JSONObject().put("owner", owner).put("digest", digest).put("key", key).toString())
        return key
    }
    fun clearPending() = store.remove("push.pending")

    fun configuration(): PushConfiguration? = runCatching {
        val j = JSONObject(store.read("push.configuration") ?: return null)
        PushConfiguration(true, j.getString("project"), j.getString("app"), j.getString("sender"), j.getString("key"),
            j.getString("package")).takeIf { it.configured }
    }.getOrNull()
    fun configure(config: PushConfiguration) = store.write("push.configuration", JSONObject().put("project", config.projectId)
        .put("app", config.applicationId).put("sender", config.senderId).put("key", config.apiKey).put("package", config.packageName).toString())
    fun clearConfiguration() = store.remove("push.configuration")

    companion object {
        fun hash(text: String): String = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        fun digest(owner: String, body: JSONObject, proof: String?): String {
            val values = body.keys().asSequence().toList().sorted().joinToString("\u001f") { "$it=${body.get(it)}" }
            return hash(owner + "\u001f" + values + "\u001f" + (proof?.let(::hash) ?: ""))
        }
    }
}
