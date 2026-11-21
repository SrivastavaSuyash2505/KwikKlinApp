package com.kwikklin.crm.data.outbox

import com.kwikklin.crm.data.network.StaffApiService
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

data class OutboxSyncSummary(
    val syncedCount: Int,
    val droppedCount: Int,
    val remainingCount: Int,
    val unauthorized: Boolean
) {
    /** True when a later attempt could still succeed (network / 5xx), so the caller should retry. */
    val shouldRetry: Boolean get() = remainingCount > 0 && !unauthorized
}

/**
 * Single replay loop for queued status-only actions, shared by the manual "Sync now"
 * button and [OfflineOutboxWorker] so both apply identical rules:
 * - HTTP 2xx / 409 Conflict: done (409 = order already moved on server) → remove.
 * - HTTP 401: session expired → stop; items stay queued until the user signs in again.
 * - Other HTTP 4xx: server rejected the transition permanently → drop.
 * - HTTP 5xx / unexpected error: keep and record the failure.
 * - IOException: connectivity lost → stop; everything not yet sent stays queued.
 */
class OutboxReplayer(
    private val api: StaffApiService,
    private val dao: OfflineActionDao
) {
    suspend fun replayAll(): OutboxSyncSummary {
        val pending = dao.getAllPending()
        if (pending.isEmpty()) return OutboxSyncSummary(0, 0, 0, false)

        var synced = 0
        var dropped = 0
        var kept = 0

        for ((index, item) in pending.withIndex()) {
            try {
                val response = api.replayRawPost(
                    relativePath = item.endpointPath,
                    body = item.payloadJson.toRequestBody(JSON),
                    idempotencyKey = item.idempotencyKey
                )
                val code = response.code()
                response.body()?.close()
                response.errorBody()?.close()
                when (code) {
                    in 200..299, 409 -> {
                        dao.deleteById(item.id)
                        synced++
                    }
                    401 -> return OutboxSyncSummary(synced, dropped, pending.size - synced - dropped, true)
                    in 400..499 -> {
                        dao.deleteById(item.id)
                        dropped++
                    }
                    else -> {
                        dao.recordFailure(item.id, "Server error HTTP $code")
                        kept++
                    }
                }
            } catch (e: IOException) {
                dao.recordFailure(item.id, e.localizedMessage ?: "No internet connection")
                // This item plus every item after it is still queued.
                return OutboxSyncSummary(synced, dropped, kept + (pending.size - index), false)
            } catch (e: Exception) {
                dao.recordFailure(item.id, e.localizedMessage ?: "Unexpected sync error")
                kept++
            }
        }
        return OutboxSyncSummary(synced, dropped, kept, false)
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
