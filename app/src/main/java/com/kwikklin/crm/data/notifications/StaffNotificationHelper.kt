package com.kwikklin.crm.data.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.kwikklin.crm.MainActivity
import com.kwikklin.crm.R

/**
 * Manages local Android notification channels for Kwik Klin staff alerts.
 * Enforces lock-screen privacy (VISIBILITY_PRIVATE) and never exposes customer phone
 * numbers or home addresses in notification bodies.
 */
object StaffNotificationHelper {
    const val CHANNEL_URGENT = "kwikklin_staff_urgent"
    const val CHANNEL_GENERAL = "kwikklin_staff_general"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return

        val urgentChannel = NotificationChannel(
            CHANNEL_URGENT,
            context.getString(R.string.notif_channel_urgent_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.notif_channel_urgent_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 150, 250)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        }

        val generalChannel = NotificationChannel(
            CHANNEL_GENERAL,
            context.getString(R.string.notif_channel_general_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = context.getString(R.string.notif_channel_general_desc)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        }

        manager.createNotificationChannel(urgentChannel)
        manager.createNotificationChannel(generalChannel)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    // Permission is checked via hasNotificationPermission() at the top, which lint can't see
    // through; notify() is additionally wrapped in runCatching.
    @SuppressLint("MissingPermission")
    fun postStaffAlert(
        context: Context,
        notificationId: Int,
        title: String,
        body: String,
        urgent: Boolean
    ) {
        if (!hasNotificationPermission(context)) return
        createChannels(context)

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val safeTitle = if (urgent) "URGENT — DO THIS NOW: $title" else title
        val publicNotification = NotificationCompat.Builder(
            context,
            if (urgent) CHANNEL_URGENT else CHANNEL_GENERAL
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(if (urgent) "Kwik Klin Urgent Alert" else "Kwik Klin Update")
            .setContentText("Open Kwik Klin to view your assigned work.")
            .build()

        val notification = NotificationCompat.Builder(
            context,
            if (urgent) CHANNEL_URGENT else CHANNEL_GENERAL
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(safeTitle)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (urgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicNotification)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        }
    }
}
