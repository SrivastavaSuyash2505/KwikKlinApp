package com.kwikklin.crm.data.security

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.util.concurrent.ConcurrentHashMap

@Serializable
private data class StoredCookie(
    val name: String,
    val value: String,
    val expiresAt: Long,
    val domain: String,
    val path: String,
    val secure: Boolean,
    val httpOnly: Boolean,
    val hostOnly: Boolean
)

/**
 * Persistent OkHttp CookieJar that stores Kwik Klin staff session cookies (kk_staff)
 * encrypted with Android Keystore AES-256-GCM.
 *
 * Wipes cleanly on logout or HTTP 401.
 */
class SecureCookieJar(
    context: Context,
    private val crypto: KeystoreCrypto = KeystoreCrypto()
) : CookieJar {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val memoryCache = ConcurrentHashMap<String, StoredCookie>()

    init {
        loadFromDisk()
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val now = System.currentTimeMillis()
        for (cookie in cookies) {
            val key = cookieKey(cookie.domain, cookie.path, cookie.name)
            if (cookie.value.isEmpty() || cookie.expiresAt <= now) {
                memoryCache.remove(key)
            } else {
                memoryCache[key] = StoredCookie(
                    name = cookie.name,
                    value = cookie.value,
                    expiresAt = cookie.expiresAt,
                    domain = cookie.domain,
                    path = cookie.path,
                    secure = cookie.secure,
                    httpOnly = cookie.httpOnly,
                    hostOnly = cookie.hostOnly
                )
            }
        }
        persistToDisk()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        var dirty = false
        val valid = mutableListOf<Cookie>()

        val iterator = memoryCache.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            val stored = entry.value
            if (stored.expiresAt <= now) {
                iterator.remove()
                dirty = true
                continue
            }
            val okCookie = stored.toOkHttpCookie()
            if (okCookie != null && okCookie.matches(url)) {
                valid.add(okCookie)
            }
        }
        if (dirty) persistToDisk()
        return valid
    }

    @Synchronized
    fun hasActiveSessionCookie(): Boolean {
        val now = System.currentTimeMillis()
        return memoryCache.values.any { it.name == STAFF_COOKIE_NAME && it.expiresAt > now && it.value.isNotBlank() }
    }

    @Synchronized
    fun clearAll() {
        memoryCache.clear()
        prefs.edit().clear().apply()
    }

    private fun loadFromDisk() {
        val encrypted = prefs.getString(KEY_COOKIES, null) ?: return
        val decrypted = crypto.decrypt(encrypted) ?: run {
            prefs.edit().clear().apply()
            return
        }
        val list = runCatching { json.decodeFromString<List<StoredCookie>>(decrypted) }.getOrDefault(emptyList())
        val now = System.currentTimeMillis()
        memoryCache.clear()
        list.filter { it.expiresAt > now && it.value.isNotBlank() }.forEach { stored ->
            memoryCache[cookieKey(stored.domain, stored.path, stored.name)] = stored
        }
    }

    private fun persistToDisk() {
        val list = memoryCache.values.toList()
        if (list.isEmpty()) {
            prefs.edit().remove(KEY_COOKIES).apply()
            return
        }
        runCatching {
            val raw = json.encodeToString(list)
            val encrypted = crypto.encrypt(raw)
            prefs.edit().putString(KEY_COOKIES, encrypted).apply()
        }
    }

    private fun StoredCookie.toOkHttpCookie(): Cookie? {
        return runCatching {
            val builder = Cookie.Builder()
                .name(name)
                .value(value)
                .expiresAt(expiresAt)
                .path(path)
            if (hostOnly) builder.hostOnlyDomain(domain) else builder.domain(domain)
            if (secure) builder.secure()
            if (httpOnly) builder.httpOnly()
            builder.build()
        }.getOrNull()
    }

    private fun cookieKey(domain: String, path: String, name: String): String = "$domain|$path|$name"

    companion object {
        private const val PREFS_NAME = "kwikklin_secure_cookies"
        private const val KEY_COOKIES = "encrypted_cookie_jar"
        const val STAFF_COOKIE_NAME = "kk_staff"
    }
}
