package com.kwikklin.crm.data.outbox

import com.kwikklin.crm.data.network.StaffApiService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException
import java.lang.reflect.Proxy
import kotlin.coroutines.Continuation
import kotlin.coroutines.intrinsics.COROUTINE_SUSPENDED
import kotlin.coroutines.resumeWithException

class OutboxReplayerTest {

    private class FakeDao(items: List<OfflineActionEntity>) : OfflineActionDao {
        val rows = items.toMutableList()
        val failures = mutableMapOf<Long, String?>()
        override fun observeForStaff(staffPhone: String): Flow<List<OfflineActionEntity>> = flowOf(rows)
        override suspend fun getAllPending() = rows.toList()
        override suspend fun insert(action: OfflineActionEntity): Long { rows += action; return action.id }
        override suspend fun recordFailure(id: Long, error: String?) { failures[id] = error }
        override suspend fun deleteById(id: Long) { rows.removeAll { it.id == id } }
        override suspend fun deleteNotOwnedBy(staffPhone: String) { rows.removeAll { it.staffPhone != staffPhone } }
        override suspend fun clearAll() = rows.clear()
    }

    /** Fake API: only replayRawPost is used; it answers with the scripted result per path. */
    private fun fakeApi(script: Map<String, Any>): StaffApiService =
        Proxy.newProxyInstance(
            StaffApiService::class.java.classLoader,
            arrayOf(StaffApiService::class.java)
        ) { _, method, args ->
            require(method.name == "replayRawPost") { "unexpected call ${method.name}" }
            when (val r = script.getValue(args[0] as String)) {
                is Int -> if (r in 200..299) Response.success("{}".toResponseBody())
                else Response.error(r, "{}".toResponseBody())
                // A Proxy can't throw a checked exception directly (it gets wrapped in
                // UndeclaredThrowableException), so fail the suspend call the way Retrofit
                // does: through its continuation.
                is IOException -> {
                    @Suppress("UNCHECKED_CAST")
                    (args.last() as Continuation<Any?>).resumeWithException(r)
                    COROUTINE_SUSPENDED
                }
                else -> error("bad script")
            }
        } as StaffApiService

    private fun item(id: Long) = OfflineActionEntity(
        id = id, staffPhone = "9", orderNumber = "O$id", endpointPath = "p$id",
        payloadJson = "{}", actionLabel = "x", idempotencyKey = "k$id"
    )

    @Test
    fun `success and 409 are removed, other 4xx dropped, 5xx kept`() = runTest {
        val dao = FakeDao(listOf(item(1), item(2), item(3), item(4)))
        val api = fakeApi(mapOf("p1" to 200, "p2" to 409, "p3" to 422, "p4" to 503))

        val summary = OutboxReplayer(api, dao).replayAll()

        assertEquals(2, summary.syncedCount)
        assertEquals(1, summary.droppedCount)
        assertEquals(1, summary.remainingCount)
        assertFalse(summary.unauthorized)
        assertTrue(summary.shouldRetry)
        assertEquals(listOf(4L), dao.rows.map { it.id })
    }

    @Test
    fun `network loss stops and counts every unsent item once`() = runTest {
        // Before the fix, a 5xx followed by an IOException double-counted the 5xx item.
        val dao = FakeDao(listOf(item(1), item(2), item(3), item(4)))
        val api = fakeApi(mapOf("p1" to 200, "p2" to 500, "p3" to IOException("offline"), "p4" to 200))

        val summary = OutboxReplayer(api, dao).replayAll()

        assertEquals(1, summary.syncedCount)
        assertEquals(3, summary.remainingCount) // p2 (5xx) + p3 (failed) + p4 (not attempted)
        assertEquals(listOf(2L, 3L, 4L), dao.rows.map { it.id })
    }

    @Test
    fun `401 stops replay and keeps the rest queued`() = runTest {
        val dao = FakeDao(listOf(item(1), item(2), item(3)))
        val api = fakeApi(mapOf("p1" to 200, "p2" to 401, "p3" to 200))

        val summary = OutboxReplayer(api, dao).replayAll()

        assertTrue(summary.unauthorized)
        assertFalse(summary.shouldRetry)
        assertEquals(2, summary.remainingCount)
        assertEquals(listOf(2L, 3L), dao.rows.map { it.id })
    }

    @Test
    fun `empty outbox is a no-op`() = runTest {
        val summary = OutboxReplayer(fakeApi(emptyMap()), FakeDao(emptyList())).replayAll()
        assertEquals(OutboxSyncSummary(0, 0, 0, false), summary)
    }
}
