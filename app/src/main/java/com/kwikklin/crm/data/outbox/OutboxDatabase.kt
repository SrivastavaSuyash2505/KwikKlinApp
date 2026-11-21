package com.kwikklin.crm.data.outbox

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/**
 * Room table used STRICTLY as a safe offline outbox for permitted status-only updates
 * (picked-up, washing, ready, advance, status, deliver, not-home).
 *
 * Financial actions (collect payment, cash handover) and customer/order tables are
 * intentionally NOT stored here to avoid stale data or double-billing.
 */
@Entity(tableName = "offline_status_outbox")
data class OfflineActionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val staffPhone: String,
    val orderNumber: String,
    val endpointPath: String, // e.g., "staff/api/orders/ORD-101/picked-up"
    val payloadJson: String,  // e.g., "{}" or "{\"note\":\"...\"}"
    val actionLabel: String,  // e.g., "Mark Picked Up"
    val idempotencyKey: String,
    val createdAtMs: Long = System.currentTimeMillis(),
    val attemptCount: Int = 0,
    val lastError: String? = null
)

@Dao
interface OfflineActionDao {
    @Query("SELECT * FROM offline_status_outbox WHERE staffPhone = :staffPhone ORDER BY createdAtMs ASC")
    fun observeForStaff(staffPhone: String): Flow<List<OfflineActionEntity>>

    @Query("SELECT * FROM offline_status_outbox ORDER BY createdAtMs ASC")
    suspend fun getAllPending(): List<OfflineActionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(action: OfflineActionEntity): Long

    @Query("UPDATE offline_status_outbox SET attemptCount = attemptCount + 1, lastError = :error WHERE id = :id")
    suspend fun recordFailure(id: Long, error: String?)

    @Query("DELETE FROM offline_status_outbox WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM offline_status_outbox WHERE staffPhone != :staffPhone")
    suspend fun deleteNotOwnedBy(staffPhone: String)

    @Query("DELETE FROM offline_status_outbox")
    suspend fun clearAll()
}

@Database(
    entities = [OfflineActionEntity::class],
    version = 1,
    exportSchema = false
)
abstract class OutboxDatabase : RoomDatabase() {
    abstract fun offlineActionDao(): OfflineActionDao

    companion object {
        @Volatile
        private var INSTANCE: OutboxDatabase? = null

        fun getInstance(context: Context): OutboxDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    OutboxDatabase::class.java,
                    "kwikklin_staff_outbox.db"
                )
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
