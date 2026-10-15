package com.pestops.field;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;

/**
 * Rings for a new lead, for ten seconds, as a short foreground service.
 *
 * A push message only buys an app a moment of running time, and phones like
 * vivo freeze it straight after - which cut the ringtone short and lost the
 * "missed lead" notification that should stay behind. A foreground service of
 * type shortService is Android's own way to finish a brief job like this: the
 * call-style alert is its notification, the app stays awake for the ten
 * seconds, then it leaves the quiet "New lead" behind and stops itself.
 */
public class RingService extends Service {
    static final String ACTION_STOP = "com.pestops.field.STOP_RING";
    private static final long RING_MS = 10_000;
    private final Handler main = new Handler(Looper.getMainLooper());
    private int id = 0;
    private String title = "", body = "", path = "";
    private boolean done = false;

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            finishRing(false);
            return START_NOT_STICKY;
        }
        title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "New lead";
        body = intent != null && intent.getStringExtra("body") != null ? intent.getStringExtra("body") : "";
        path = intent != null && intent.getStringExtra("path") != null ? intent.getStringExtra("path") : "/leads";
        id = (int) (System.currentTimeMillis() & 0x3fffffff);
        done = false;

        Notification n = Ringer.ringing(this, id, title, body, path);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            else startForeground(id, n);
        } catch (Exception e) {
            // Not allowed to run in the foreground here: ring as a plain alert instead.
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, n);
        }
        Ringer.startSound(this);
        main.removeCallbacksAndMessages(null);
        main.postDelayed(() -> finishRing(true), RING_MS);
        return START_NOT_STICKY;
    }

    /** Stop the sound and the alert; leave a quiet "New lead" behind unless it was opened. */
    private void finishRing(boolean leaveMissed) {
        if (done) { stopSelf(); return; }
        done = true;
        main.removeCallbacksAndMessages(null);
        Ringer.stopSound();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) { }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(id);
            if (leaveMissed) nm.notify(id + 1, Ringer.missed(this, id, title, body, path));
        }
        stopSelf();
    }

    /** shortService has a time limit (about 3 minutes); never reached, but end cleanly if it is. */
    @Override
    public void onTimeout(int startId) {
        finishRing(true);
    }

    @Override
    public void onDestroy() {
        Ringer.stopSound();
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
