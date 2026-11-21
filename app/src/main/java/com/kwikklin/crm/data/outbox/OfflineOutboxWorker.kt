package com.kwikklin.crm.data.outbox

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.kwikklin.crm.KwikKlinApplication
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that safely replays queued status-only actions when connectivity returns.
 * - HTTP 2xx: Synced -> remove from outbox.
 * - HTTP 409 Conflict: Order already moved forward on server -> treat as resolved & remove.
 * - HTTP 401 Unauthorized: Session expired -> stop immediately (user must re-authenticate).
 * - Other HTTP 4xx: Server rejected transition -> drop from outbox (cannot succeed on retry).
 * - HTTP 5xx / IOException: Transient error -> keep in outbox and retry with exponential backoff.
 */
class OfflineOutboxWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? KwikKlinApplication ?: return Result.failure()
        val dao = app.outboxDatabase.offlineActionDao()
        val api = app.staffApiService

        val pending = dao.getAllPending()
        if (pending.isEmpty()) return Result.success()

        var shouldRetry = false
        for (item in pending) {
            try {
                val body = item.payloadJson.toRequestBody("application/json; charset=utf-8".toMediaType())
                val response = api.replayRawPost(
                    relativePath = item.endpointPath,
                    body = body,
                    idempotencyKey = item.idempotencyKey
                )
                val code = response.code()
                when {
                    code in 200..299 || code == 409 -> {
                        dao.deleteById(item.id)
                    }
                    code == 401 -> {
                        // Session expired; stop draining until user logs back in
                        return Result.failure()
                    }
                    code in 400..499 -> {
                        // Permanent client rejection (e.g. invalid transition or cancelled order)
                        dao.deleteById(item.id)
                    }
                    else -> {
                        dao.recordFailure(item.id, "Server error HTTP $code")
                        shouldRetry = true
                    }
                }
            } catch (e: IOException) {
                dao.recordFailure(item.id, e.localizedMessage ?: "No internet connection")
                shouldRetry = true
                break
            } catch (e: Exception) {
                dao.recordFailure(item.id, e.localizedMessage ?: "Unexpected sync error")
                shouldRetry = true
            }
        }

        return if (shouldRetry) Result.retry() else Result.success()
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "kwikklin_offline_status_outbox_sync"

        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<OfflineOutboxWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request)
        }
    }
}
