package com.pestops.field;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createAlertsChannel();
    }

    /**
     * The alerts channel, carrying the bundled ringtone (res/raw/notify.wav).
     *
     * An Android channel's sound and importance are frozen the instant it is
     * first created, so the id is versioned: bump the "-3" suffix to reissue
     * with a new tone. Creating it here — natively, at launch — guarantees the
     * channel exists with its sound before the first local OR FCM notification,
     * independent of whatever the web layer does.
     */
    private void createAlertsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel channel = new NotificationChannel(
                "pestops-alerts-3", "PestOps alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Services, schedules and money");

        Uri sound = Uri.parse("android.resource://" + getPackageName() + "/raw/notify");
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        channel.setSound(sound, attrs);

        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }
}
