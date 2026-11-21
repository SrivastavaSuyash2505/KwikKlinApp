package com.kwikklin.crm

import android.app.Application
import com.kwikklin.crm.data.crm.CrmConnectionPrefs
import com.kwikklin.crm.data.network.NetworkMonitor
import com.kwikklin.crm.data.network.StaffApiClientFactory
import com.kwikklin.crm.data.network.StaffApiService
import com.kwikklin.crm.data.notifications.StaffNotificationHelper
import com.kwikklin.crm.data.outbox.OutboxDatabase
import com.kwikklin.crm.data.outbox.OutboxReplayer
import com.kwikklin.crm.data.repository.StaffRepository
import com.kwikklin.crm.data.security.SecureCookieJar

class KwikKlinApplication : Application() {
    val connectionPrefs: CrmConnectionPrefs by lazy { CrmConnectionPrefs(this) }
    val cookieJar: SecureCookieJar by lazy { SecureCookieJar(this) }
    val networkMonitor: NetworkMonitor by lazy { NetworkMonitor(this) }
    val outboxDatabase: OutboxDatabase by lazy { OutboxDatabase.getInstance(this) }

    val staffApiService: StaffApiService by lazy {
        StaffApiClientFactory.create(connectionPrefs, cookieJar)
    }

    val outboxReplayer: OutboxReplayer by lazy {
        OutboxReplayer(staffApiService, outboxDatabase.offlineActionDao())
    }

    val staffRepository: StaffRepository by lazy {
        StaffRepository(
            context = this,
            api = staffApiService,
            cookieJar = cookieJar,
            outboxDao = outboxDatabase.offlineActionDao(),
            outboxReplayer = outboxReplayer,
            connectionPrefs = connectionPrefs,
            networkMonitor = networkMonitor
        )
    }

    override fun onCreate() {
        super.onCreate()
        StaffNotificationHelper.createChannels(this)
    }
}
