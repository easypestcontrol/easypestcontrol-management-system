package com.pestops.field;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Every push the app receives comes through here first.
 *
 * A message marked kind=ring (a new lead for this salesperson) rings like a
 * call (Ringer). Everything else goes to the push plugin exactly as before,
 * so the ordinary notifications and the in-app banners are unchanged.
 *
 * The ring message is sent data-only, so it arrives here even when the app is
 * closed - a notification message would be shown by Android itself, silently
 * bypassing this code.
 */
public class LeadRingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if ("ring".equals(d.get("kind"))) {
            Ringer.ring(getApplicationContext(), d.get("title"), d.get("body"), d.get("path"));
            return;
        }
        super.onMessageReceived(msg);
    }
}
