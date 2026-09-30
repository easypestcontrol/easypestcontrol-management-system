package com.pestops.field;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Records a trip while the phone is in a pocket.
 *
 * The app is a window onto the website, and a website only hears from the GPS
 * while it is on the screen. Lock the phone, open the dialler, put it on the
 * dashboard with the display off - and the trip stops being recorded. Trips
 * came back with one position, or none, and a distance of zero.
 *
 * This is the part of a trip that has to be native: a foreground service,
 * with its notification, that keeps listening to the GPS and sends every fix
 * to the server itself - over its own connection, not the web page's, because
 * a page in the background is not allowed to talk to the network either.
 *
 * It does exactly one thing. Which trip, whose token and which server arrive
 * from the web layer when the trip starts (TripTrackerPlugin); the rules about
 * which fixes count, the distance and the route are all the server's. A fix
 * that cannot be sent waits in memory and goes with the next one, in order,
 * with its own time - a tunnel is a delay, not a hole in the route.
 *
 * The service ends when the web layer says the trip has ended, or when the
 * server says so (the office cancelled it, the service visit was finished):
 * a ping answered "this trip has ended" is the last one.
 */
public class TripService extends Service implements LocationListener {

    /* Versioned: a channel's importance is frozen when it is first made, and
       the first one ("pestops-trip") was a quiet LOW channel that never
       popped up. This one pops up once when the trip starts. */
    static final String CHANNEL = "pestops-trip-2";
    static final String OLD_CHANNEL = "pestops-trip";
    static final String PREFS = "trip-tracker";
    static final int NOTE_ID = 1207;

    /** One fix every four seconds is the same cadence the web tracker uses. */
    private static final long EVERY_MS = 4000;
    /** What is held while there is no signal - about two hours of driving. */
    private static final int HOLD = 2000;
    private static final int BATCH = 150;

    // Read by the plugin's status() - what the web layer can show or log.
    static volatile boolean running = false;
    static volatile int sent = 0;
    static volatile int queued = 0;
    static volatile String lastError = "";
    static volatile String activeTrip = "";

    private final List<JSONObject> queue = new ArrayList<>();
    private LocationManager lm;
    private PowerManager.WakeLock wake;
    private HandlerThread thread;
    private Handler sender;
    private String tripId = "";
    private String token = "";
    private String base = "";
    private String dest = "";
    private String purpose = "";
    private long startAt = 0;
    private long lastTaken = 0;
    private boolean listening = false;
    private final SimpleDateFormat iso;

    public TripService() {
        iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = intent != null ? intent.getStringExtra("tripId") : null;
        if (id != null && !id.isEmpty()) {
            // A different trip: whatever was waiting belongs to the old one.
            if (!id.equals(tripId)) synchronized (queue) { queue.clear(); }
            tripId = id;
            token = str(intent.getStringExtra("token"));
            base = str(intent.getStringExtra("base"));
            dest = str(intent.getStringExtra("dest"));
            purpose = str(intent.getStringExtra("purpose"));
            startAt = intent.getLongExtra("startAt", System.currentTimeMillis());
            prefs.edit().putString("tripId", tripId).putString("token", token).putString("base", base)
                    .putString("dest", dest).putString("purpose", purpose).putLong("startAt", startAt).apply();
        } else {
            /* Restarted by Android after being killed, or the notification was
               swiped away and is being put back: carry on with what we were told. */
            tripId = prefs.getString("tripId", "");
            token = prefs.getString("token", "");
            base = prefs.getString("base", "");
            dest = prefs.getString("dest", "");
            purpose = prefs.getString("purpose", "");
            startAt = prefs.getLong("startAt", System.currentTimeMillis());
        }
        if (tripId.isEmpty() || token.isEmpty() || base.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            Notification note = notification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTE_ID, note);
            }
        } catch (Exception e) {
            // No location permission, or Android refused a background start.
            lastError = "could not start: " + e.getMessage();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (thread == null) {
            thread = new HandlerThread("trip-sender");
            thread.start();
            sender = new Handler(thread.getLooper());
            sender.postDelayed(heartbeat, 20000);
        }
        listen();
        hold();
        running = true;
        activeTrip = tripId;
        lastError = "";
        return START_STICKY;
    }

    /** Whatever is waiting is retried on a timer too, not only on the next fix. */
    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            flush();
            showing();
            if (sender != null) sender.postDelayed(this, 20000);
        }
    };

    private void listen() {
        if (listening) return;
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) { lastError = "no location service"; return; }
        try {
            /* The fused provider where the phone has one: it keeps a position
               through a tunnel or between buildings by leaning on the other
               sensors. Plain GPS everywhere else. */
            String provider = LocationManager.GPS_PROVIDER;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
                provider = LocationManager.FUSED_PROVIDER;
                android.location.LocationRequest req = new android.location.LocationRequest.Builder(3000)
                        .setQuality(android.location.LocationRequest.QUALITY_HIGH_ACCURACY)
                        .setMinUpdateIntervalMillis(2000)
                        .build();
                lm.requestLocationUpdates(provider, req, getMainExecutor(), this);
            } else {
                lm.requestLocationUpdates(provider, 3000, 0f, this, Looper.getMainLooper());
            }
            listening = true;
        } catch (SecurityException e) {
            lastError = "location permission missing";
        } catch (Exception e) {
            lastError = "location: " + e.getMessage();
        }
    }

    /** Keep the processor awake: a fix that arrives while it sleeps is a fix never sent. */
    private void hold() {
        if (wake != null && wake.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pestops:trip");
        wake.setReferenceCounted(false);
        wake.acquire(12 * 60 * 60 * 1000L); // a trip is never longer; never held for ever
    }

    @Override
    public void onLocationChanged(@NonNull Location l) {
        long now = System.currentTimeMillis();
        if (now - lastTaken < EVERY_MS) return;
        // A position good to a kilometre is not a position; the server would refuse it anyway.
        if (l.hasAccuracy() && l.getAccuracy() > 150) return;
        lastTaken = now;
        try {
            JSONObject f = new JSONObject();
            f.put("lat", l.getLatitude());
            f.put("lng", l.getLongitude());
            f.put("acc", l.hasAccuracy() ? l.getAccuracy() : 0);
            if (l.hasSpeed()) f.put("spd", l.getSpeed());
            // The fix's own time when it is believable, the clock's otherwise.
            long at = Math.abs(l.getTime() - now) < 120000 ? l.getTime() : now;
            f.put("at", iso.format(new Date(at)));
            synchronized (queue) {
                queue.add(f);
                while (queue.size() > HOLD) queue.remove(0);
                queued = queue.size();
            }
        } catch (Exception ignored) { /* a fix we could not describe is one fix */ }
        if (sender != null) sender.post(this::flush);
    }

    // Older Android calls these; there is nothing to do in them.
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(@NonNull String provider) { }
    @Override public void onProviderDisabled(@NonNull String provider) { lastError = "Location is switched off"; }

    /** Send what is waiting, oldest first. Runs on the sender thread only. */
    private void flush() {
        final List<JSONObject> batch = new ArrayList<>();
        synchronized (queue) {
            for (int i = 0; i < queue.size() && i < BATCH; i++) batch.add(queue.get(i));
        }
        if (batch.isEmpty()) return;
        HttpURLConnection c = null;
        try {
            JSONObject body = new JSONObject();
            if (batch.size() == 1) body = batch.get(0);
            else body.put("batch", new JSONArray(batch));
            c = (HttpURLConnection) new URL(base + "/trips/" + tripId + "/ping").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + token);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
            int code = c.getResponseCode();
            if (code >= 200 && code < 300) {
                synchronized (queue) {
                    for (int i = 0; i < batch.size() && !queue.isEmpty(); i++) queue.remove(0);
                    queued = queue.size();
                }
                sent += batch.size();
                lastError = "";
                // A backlog drains without waiting for the next fix.
                boolean more;
                synchronized (queue) { more = queue.size() > 1; }
                if (more && sender != null) sender.post(this::flush);
            } else if (code == 400 || code == 401 || code == 404) {
                /* The trip is over, is not ours, or the sign-in has gone: there
                   is nothing more this service can record. */
                lastError = "stopped by the server (" + code + ")";
                finish();
            } else {
                lastError = "server answered " + code;
            }
        } catch (Exception e) {
            lastError = "no connection"; // they wait for the next try
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** The trip is over: forget it, and stop. */
    private void finish() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        new Handler(Looper.getMainLooper()).post(this::stopSelf);
    }

    /**
     * The trip's notification: there from the moment the trip starts until it
     * ends, so nobody forgets a trip is running.
     *
     * It pops up once, when the trip starts, then stays quietly in the bar with
     * the time since the start. It says where the trip is going and what to do
     * on arrival, and End trip opens the trip page where the trip is ended.
     *
     * Ongoing, so "Clear all" leaves it. Android 14 lets a person swipe even an
     * ongoing notification away, so a swiped one is put straight back
     * (setDeleteIntent restarts this service, which re-posts it), and the
     * heartbeat checks every 20 s that it is still showing.
     */
    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Trip in progress", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Shown for as long as a trip is running");
            ch.setShowBadge(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
            try { nm.deleteNotificationChannel(OLD_CHANNEL); } catch (Exception ignored) { }
        }
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent open = PendingIntent.getActivity(this, 0, toTripPage(false), piFlags);
        PendingIntent end = PendingIntent.getActivity(this, 1, toTripPage(true), piFlags);
        PendingIntent putBack = PendingIntent.getService(this, 2, new Intent(this, TripService.class), piFlags);

        String where = dest.isEmpty() ? "your destination" : dest;
        String title = dest.isEmpty() ? "Trip started" : "Trip started to " + dest;
        String body = "When you reach " + where + ", please end your trip."
                + (purpose.isEmpty() ? "" : "\n" + purpose)
                + "\nYour route is being recorded.";
        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_trip)
                .setContentTitle(title)
                .setContentText("When you reach " + where + ", please end your trip.")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setWhen(startAt > 0 ? startAt : System.currentTimeMillis())
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(open)
                .setDeleteIntent(putBack)
                .addAction(R.drawable.ic_trip, "End trip", end)
                .build();
    }

    /** The app, opened on the trip page (with the End trip question when asked). */
    private Intent toTripPage(boolean ending) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String site = base.endsWith("/api") ? base.substring(0, base.length() - 4) : base;
        i.putExtra(MainActivity.OPEN_URL, site + "/trip" + (ending ? "?end=1" : ""));
        return i;
    }

    /** Put the notification back if it is not showing (swiped away, cleared by the phone). */
    private void showing() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || tripId.isEmpty()) return;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getId() == NOTE_ID) return;
            }
            nm.notify(NOTE_ID, notification());
        } catch (Exception ignored) { }
    }

    @Override
    public void onDestroy() {
        running = false;
        activeTrip = "";
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignored) { }
        listening = false;
        if (sender != null) sender.removeCallbacksAndMessages(null);
        if (thread != null) { thread.quitSafely(); thread = null; sender = null; }
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private static String str(String s) { return s == null ? "" : s; }
}
