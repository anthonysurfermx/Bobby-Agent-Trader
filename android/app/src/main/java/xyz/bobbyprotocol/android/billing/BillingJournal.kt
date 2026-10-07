package xyz.bobbyprotocol.android.billing

import android.content.Context
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import xyz.bobbyprotocol.android.data.SecureStore

/** A tokenless started purchase remains pending. Account switches never erase another owner's receipt. */
internal data class PendingPurchase(
    val operationId: String,
    val productId: String,
    val basePlanId: String,
    val offerId: String?,
    val attemptId: String? = null,
    val dispatchOperationId: String = UUID.randomUUID().toString(),
    val launchStarted: Boolean = false,
    val purchaseToken: String? = null,
)

internal interface BillingJournal {
    fun read(userId: String): PendingPurchase?
    fun write(userId: String, value: PendingPurchase)
    fun retire(userId: String)
    fun remove(userId: String)
}

internal class EncryptedBillingJournal(context: Context) : BillingJournal {
    companion object { private val storageLock = Any() }
    private val storage = SecureStore(context.applicationContext)
    private fun key(userId: String) = "billing.pending." + MessageDigest.getInstance("SHA-256")
        .digest(userId.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    override fun read(userId: String): PendingPurchase? = synchronized(storageLock) { storage.read(key(userId))?.let { raw ->
        runCatching {
            val body = JSONObject(raw)
            PendingPurchase(body.getString("operationId"), body.getString("productId"), body.getString("basePlanId"),
                body.opt("offerId") as? String, body.opt("attemptId") as? String,
                body.getString("dispatchOperationId"), body.getBoolean("launchStarted"), body.opt("purchaseToken") as? String)
        }.getOrNull()
    } }
    override fun write(userId: String, value: PendingPurchase) {
        synchronized(storageLock) {
        if (storage.read(key(userId) + ".retired") == value.operationId) return
        storage.write(key(userId), JSONObject().put("operationId", value.operationId).put("productId", value.productId)
            .put("basePlanId", value.basePlanId).put("offerId", value.offerId ?: JSONObject.NULL)
            .put("attemptId", value.attemptId ?: JSONObject.NULL).put("dispatchOperationId", value.dispatchOperationId)
            .put("launchStarted", value.launchStarted).put("purchaseToken", value.purchaseToken ?: JSONObject.NULL).toString())
        }
    }
    override fun retire(userId: String) = synchronized(storageLock) {
        val operationId = read(userId)?.operationId ?: "retired"
        storage.writeMany(mapOf(key(userId) + ".retired" to operationId), remove = setOf(key(userId)))
    }
    override fun remove(userId: String) = synchronized(storageLock) { storage.remove(key(userId)) }
}

internal class MemoryBillingJournal : BillingJournal {
    private val values = mutableMapOf<String, PendingPurchase>()
    private val retired = mutableMapOf<String, String>()
    override fun read(userId: String) = values[userId]
    override fun write(userId: String, value: PendingPurchase) { if (retired[userId] != value.operationId) values[userId] = value }
    override fun retire(userId: String) { values.remove(userId)?.let { retired[userId] = it.operationId } }
    override fun remove(userId: String) { values.remove(userId) }
}
