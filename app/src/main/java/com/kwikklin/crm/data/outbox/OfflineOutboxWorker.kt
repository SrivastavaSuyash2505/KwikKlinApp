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
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker that replays queued status-only actions when connectivity returns.
 * The replay rules live in [OutboxReplayer]; this worker only maps the outcome to
 * success / retry (exponential backoff) / failure (session expired).
 */
class OfflineOutboxWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? KwikKlinApplication ?: return Result.failure()
        val summary = app.outboxReplayer.replayAll()
        return when {
            summary.unauthorized -> Result.failure() // wait until the user signs in again
            summary.shouldRetry -> Result.retry()
            else -> Result.success()
        }
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
