package com.kwikklin.crm.data.crm

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.kwikklin.crm.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

data class CrmHealthResult(
    val isHealthy: Boolean,
    val message: String,
    val latencyMs: Long = 0L
)

class CrmConnectionPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("kwikklin_crm_connection", Context.MODE_PRIVATE)

    fun getBaseUrl(): String {
        val envDefault = BuildConfig.CRM_BASE_URL
            .takeIf { it.isNotBlank() && it != "not_set" }
            ?: DEFAULT_CRM_URL
        val saved = prefs.getString(KEY_BASE_URL, null)
        return normalizeBaseUrl(saved ?: envDefault)
    }

    fun setBaseUrl(rawUrl: String): String {
        val normalized = normalizeBaseUrl(rawUrl)
        prefs.edit().putString(KEY_BASE_URL, normalized).apply()
        return normalized
    }

    companion object {
        const val DEFAULT_CRM_URL = "https://kwikklin.online"
        private const val KEY_BASE_URL = "crm_base_url"

        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim().trimEnd('/')
            if (trimmed.isEmpty()) return DEFAULT_CRM_URL
            return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                trimmed
            } else {
                "https://$trimmed"
            }
        }
    }
}

object CrmHealthChecker {
    fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val active = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(active) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun pingHealth(baseUrl: String): CrmHealthResult = withContext(Dispatchers.IO) {
        val start = System.currentTimeMillis()
        val healthUrl = "${CrmConnectionPrefs.normalizeBaseUrl(baseUrl)}/health"
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(healthUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 6000
                readTimeout = 6000
                instanceFollowRedirects = true
            }
            val code = conn.responseCode
            val latency = System.currentTimeMillis() - start
            val body = runCatching {
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() }.orEmpty()
            }.getOrDefault("")

            when {
                code in 200..299 && body.contains("ok", ignoreCase = true) -> {
                    CrmHealthResult(true, "Kwik Klin Server Online (${latency}ms)", latency)
                }
                code in 200..299 -> {
                    CrmHealthResult(true, "Server Reachable (HTTP $code, ${latency}ms)", latency)
                }
                else -> {
                    CrmHealthResult(false, "Server responded HTTP $code", latency)
                }
            }
        } catch (e: Exception) {
            CrmHealthResult(
                isHealthy = false,
                message = "Cannot reach server: ${e.localizedMessage ?: "Check internet or URL"}"
            )
        } finally {
            conn?.disconnect()
        }
    }
}
