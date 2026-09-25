package com.pestops.field;

import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createAlertsChannel();
        wireDownloads();
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

    /**
     * Make attachments downloadable from inside the app.
     *
     * The Android WebView drops an <a download> on the floor — nothing is
     * saved. So we (1) expose AndroidDL.save(url, name) for the web layer to
     * call directly, and (2) set a DownloadListener as a safety net for any
     * link the WebView itself treats as a download. Both funnel into save():
     * an http(s) file goes to the system DownloadManager, and an inline
     * data: URL (a shrunk photo, a recorded voice note) is decoded and written
     * to the public Downloads folder via MediaStore.
     */
    private void wireDownloads() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        web.addJavascriptInterface(new DlBridge(), "AndroidDL");
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            save(url, name);
        });
    }

    /** The object the web calls as window.AndroidDL.save(url, name). */
    public class DlBridge {
        @JavascriptInterface
        public void save(final String url, final String name) {
            // Off the binder thread: a data: URL may be several megabytes.
            new Thread(() -> MainActivity.this.save(url, name)).start();
        }
    }

    private void save(String url, String name) {
        try {
            String fname = sanitize(name);
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fname);
                req.setTitle(fname);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) req.addRequestHeader("Cookie", cookie);
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(req);
                toast("Saving " + fname + "…");
            } else if (url != null && url.startsWith("data:")) {
                saveDataUrl(url, fname);
            } else {
                toast("Couldn't save this file");
            }
        } catch (Exception e) {
            toast("Couldn't save this file");
        }
    }

    /** Decode a base64 data: URL and drop it in the public Downloads folder. */
    private void saveDataUrl(String dataUrl, String name) throws Exception {
        int comma = dataUrl.indexOf(',');
        if (comma < 0) { toast("Couldn't save this file"); return; }
        String header = dataUrl.substring(5, comma);          // e.g. image/jpeg;base64
        String b64 = dataUrl.substring(comma + 1);
        byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
        String mime = header.split(";")[0];
        if (mime.isEmpty()) mime = "application/octet-stream";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver cr = getContentResolver();
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
            cv.put(MediaStore.Downloads.MIME_TYPE, mime);
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri item = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (item == null) { toast("Couldn't save this file"); return; }
            try (OutputStream os = cr.openOutputStream(item)) {
                if (os != null) os.write(bytes);
            }
            cv.clear();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(item, cv, null, null);
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, name);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }
        }
        toast("Saved " + name + " to Downloads");
    }

    /** A safe, plain filename — no path separators, always something. */
    private String sanitize(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]", " ").trim();
        return n.isEmpty() ? "download" : n;
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_SHORT).show());
    }
}
