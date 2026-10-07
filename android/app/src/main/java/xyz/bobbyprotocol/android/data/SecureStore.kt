package xyz.bobbyprotocol.android.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM values use an Android Keystore key that is never exported or backed up. */
internal class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("bobby.secure.v1", Context.MODE_PRIVATE)
    private val alias = "xyz.bobbyprotocol.android.session.v1"

    @Synchronized
    fun read(name: String): String? {
        val encoded = prefs.getString(name, null) ?: return null
        return try {
            val parts = encoded.split(':')
            check(parts.size == 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, decode(parts[0])))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8)
        } catch (_: Exception) {
            // A restore without the device key, or corrupt ciphertext, cannot restore an identity.
            prefs.edit().remove(name).commit()
            null
        }
    }

    @Synchronized
    fun write(name: String, value: String) {
        writeMany(mapOf(name to value))
    }

    /** Session replacement/deletion and its epoch are persisted as one preferences transaction. */
    @Synchronized
    fun writeMany(values: Map<String, String>, remove: Set<String> = emptySet()) {
        val editor = prefs.edit()
        for ((name, value) in values) editor.putString(name, encrypt(name, value))
        for (name in remove) editor.remove(name)
        check(editor.commit()) { "Secure storage is unavailable" }
    }

    private fun encrypt(name: String, value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        return "${encode(cipher.iv)}:${encode(cipher.doFinal(value.toByteArray(Charsets.UTF_8)))}"
    }

    @Synchronized
    fun remove(name: String) { check(prefs.edit().remove(name).commit()) { "Secure storage is unavailable" } }

    @Synchronized
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
        }.generateKey()
    }

    private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)
    private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}
