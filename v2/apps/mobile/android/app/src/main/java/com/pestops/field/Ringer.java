package com.pestops.field;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * A new lead rings like a call.
 *
 * A notification is a ping a salesperson reads when they next look at the
 * phone; a lead is worth most in its first minutes. So a lead message rings:
 * the phone's own CALL ringtone, looping, with vibration, for ten seconds,
 * under a call-style alert ("Open lead") that comes up over the lock screen.
 * Then it stops and leaves a quiet "New lead" notification behind, the way a
 * missed call stays. The ten seconds run in RingService, so the phone cannot
 * freeze the app half-way through.
 *
 * The ringtone is played here, not left to the notification channel: some
 * phones (vivo, for one) swap a channel's sound for their notification tone,
 * which is exactly the ping this is meant to replace.
 *
 * It respects the phone: on silent it stays silent, on vibrate it only
 * vibrates, and on Do Not Disturb it does not ring.
 */
final class Ringer {
    static final String RING_CHANNEL = "pestops-ring-2";
    static final String OLD_RING_CHANNEL = "pestops-ring-1";
    static final String QUIET_CHANNEL = "pestops-lead-missed-1";
    private static final long[] BUZZ = { 0, 1000, 700, 1000, 700, 1000, 700, 1000, 700, 1000, 700, 1000 };

    private static Ringtone tone;
    private static MediaPlayer player;
    private static Vibrator buzzer;

    private Ringer() {}

    /** Start ringing for a lead (from the push handler). */
    static void ring(Context ctx, String title, String body, String path) {
        Intent i = new Intent(ctx, RingService.class);
        i.putExtra("title", title);
        i.putExtra("body", body);
        i.putExtra("path", path);
        try {
            ContextCompat.startForegroundService(ctx, i);
        } catch (Exception e) {
            // Could not start the service: at least show the alert and ring briefly.
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            int id = (int) (System.currentTimeMillis() & 0x3fffffff);
            if (nm != null) nm.notify(id, ringing(ctx, id, title, body, path));
            startSound(ctx);
        }
    }

    /** Stop ringing now - the lead was opened. */
    static void stop(Context ctx) {
        stopSound();
        try {
            Intent i = new Intent(ctx, RingService.class);
            i.setAction(RingService.ACTION_STOP);
            ctx.startService(i);
        } catch (Exception ignored) { }
    }

    private static PendingIntent openLead(Context ctx, int id, String path) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(MainActivity.OPEN_URL, path == null || path.isEmpty() ? "/leads" : path);
        return PendingIntent.getActivity(ctx, id, open, flags);
    }

    /** The call-style alert shown while it rings. */
    static Notification ringing(Context ctx, int id, String title, String body, String path) {
        channels(ctx);
        PendingIntent tap = openLead(ctx, id, path);
        String t = title == null || title.isEmpty() ? "New lead" : title;
        String b = body == null ? "" : body;
        return new NotificationCompat.Builder(ctx, RING_CHANNEL)
                .setSmallIcon(R.drawable.ic_trip)
                .setContentTitle(t)
                .setContentText(b)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(b))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(tap)
                .setFullScreenIntent(tap, true)
                .addAction(R.drawable.ic_trip, "Open lead", tap)
                .setOngoing(true)
                .build();
    }

    /** What stays after the ring, like a missed call. */
    static Notification missed(Context ctx, int id, String title, String body, String path) {
        channels(ctx);
        PendingIntent tap = openLead(ctx, id + 1, path);
        String t = title == null || title.isEmpty() ? "New lead" : title;
        String b = body == null ? "" : body;
        return new NotificationCompat.Builder(ctx, QUIET_CHANNEL)
                .setSmallIcon(R.drawable.ic_trip)
                .setContentTitle(t)
                .setContentText(b)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(b))
                .setContentIntent(tap)
                .addAction(R.drawable.ic_trip, "Open lead", tap)
                .setAutoCancel(true)
                .setSilent(true)
                .build();
    }

    static void startSound(Context ctx) {
        stopSound();
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        int mode = am != null ? am.getRingerMode() : AudioManager.RINGER_MODE_NORMAL;
        boolean dnd = nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL;
        if (dnd || mode == AudioManager.RINGER_MODE_SILENT) return;

        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pestops:lead-ring").acquire(12_000);
        } catch (Exception ignored) { }

        try {
            buzzer = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (buzzer != null && buzzer.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) buzzer.vibrate(VibrationEffect.createWaveform(BUZZ, -1));
                else buzzer.vibrate(BUZZ, -1);
            }
        } catch (Exception ignored) { }

        if (mode != AudioManager.RINGER_MODE_NORMAL) return; // vibrate mode: buzz only
        AudioAttributes asRingtone = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        // The person's ringtone is often a song from their own files, which the
        // app itself may not read. Android's Ringtone player opens it with the
        // system's access, so it is tried first; the phone's built-in tone is
        // the fallback.
        try {
            Ringtone r = RingtoneManager.getRingtone(ctx, Settings.System.DEFAULT_RINGTONE_URI);
            if (r != null) {
                r.setAudioAttributes(asRingtone);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.setLooping(true);
                r.play();
                tone = r;
                return;
            }
        } catch (Exception ignored) { tone = null; }
        try {
            Uri builtIn = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE);
            if (builtIn == null) builtIn = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(asRingtone);
            mp.setDataSource(ctx, builtIn);
            mp.setLooping(true);
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Exception ignored) { player = null; }
    }

    static void stopSound() {
        try { if (tone != null) tone.stop(); } catch (Exception ignored) { }
        tone = null;
        try { if (player != null) { player.stop(); player.release(); } } catch (Exception ignored) { }
        player = null;
        try { if (buzzer != null) buzzer.cancel(); } catch (Exception ignored) { }
        buzzer = null;
    }

    private static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        // Silent channel: the ringtone is played by Ringer itself (see above).
        NotificationChannel ring = new NotificationChannel(RING_CHANNEL, "New leads (rings like a call)", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("A new lead rings with your call ringtone for about ten seconds");
        ring.setSound(null, null);
        ring.enableVibration(false);
        ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ring);
        try { nm.deleteNotificationChannel(OLD_RING_CHANNEL); } catch (Exception ignored) { }

        NotificationChannel quiet = new NotificationChannel(QUIET_CHANNEL, "New leads (after the ring)", NotificationManager.IMPORTANCE_DEFAULT);
        quiet.setDescription("What stays after a lead has rung");
        quiet.setSound(null, null);
        nm.createNotificationChannel(quiet);
    }
}
