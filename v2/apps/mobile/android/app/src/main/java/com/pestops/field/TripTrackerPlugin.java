package com.pestops.field;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The web layer's handle on TripService.
 *
 *   Capacitor.Plugins.TripTracker.start({ tripId, token, base })
 *   Capacitor.Plugins.TripTracker.stop()
 *   Capacitor.Plugins.TripTracker.status()
 *
 * start() is called when a trip begins (and again whenever the app is opened
 * with a trip running - it is safe to repeat). It asks for Location if the
 * phone has not granted it, then hands the trip to the service. It must be
 * called while the app is on screen: Android lets a service that was started
 * from the foreground keep reading the GPS after the screen goes dark, and
 * refuses one started from the background.
 */
@CapacitorPlugin(
    name = "TripTracker",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class TripTrackerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String tripId = call.getString("tripId", "");
        String token = call.getString("token", "");
        String base = call.getString("base", "");
        if (tripId == null || tripId.isEmpty() || token == null || token.isEmpty() || base == null || base.isEmpty()) {
            call.reject("tripId, token and base are required");
            return;
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            // The notification permission rides along on Android 13+, where the
            // "Trip in progress" line cannot be shown without it.
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAliases(new String[] { "location", "notifications" }, call, "afterAsk");
            } else {
                requestPermissionForAlias("location", call, "afterAsk");
            }
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "afterAsk");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void afterAsk(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location is not allowed for this app");
            return;
        }
        begin(call); // with or without the notification permission - the route matters more
    }

    private void begin(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(ctx, TripService.class);
        i.putExtra("tripId", call.getString("tripId", ""));
        i.putExtra("token", call.getString("token", ""));
        i.putExtra("base", call.getString("base", ""));
        // What the notification says: where the trip is going and since when.
        i.putExtra("dest", call.getString("dest", ""));
        i.putExtra("purpose", call.getString("purpose", ""));
        Double at = call.getDouble("startAt");
        i.putExtra("startAt", at != null ? at.longValue() : System.currentTimeMillis());
        try {
            ContextCompat.startForegroundService(ctx, i);
        } catch (Exception e) {
            call.reject("Could not start recording: " + e.getMessage());
            return;
        }
        JSObject out = new JSObject();
        out.put("started", true);
        call.resolve(out);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(TripService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        ctx.stopService(new Intent(ctx, TripService.class));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        out.put("running", TripService.running);
        out.put("tripId", TripService.activeTrip);
        out.put("sent", TripService.sent);
        out.put("queued", TripService.queued);
        out.put("lastError", TripService.lastError);
        call.resolve(out);
    }
}
