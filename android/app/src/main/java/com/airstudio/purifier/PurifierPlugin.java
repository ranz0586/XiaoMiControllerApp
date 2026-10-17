package com.airstudio.purifier;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.LinkProperties;
import android.net.LinkAddress;
import java.net.Inet4Address;

@CapacitorPlugin(name = "Purifier")
public class PurifierPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean active = true;
    private SecureStore store;
    private WifiManager.MulticastLock multicast;

    @Override public void load() { store = new SecureStore(getContext()); }
    @Override protected void handleOnPause() { active = false; releaseMulticast(); }
    @Override protected void handleOnResume() { active = true; }
    @Override protected void handleOnDestroy() { active = false; releaseMulticast(); worker.shutdownNow(); }

    private synchronized void acquireMulticast() {
        if (!active) throw new IllegalStateException();
        if (multicast == null) {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            multicast = wifi.createMulticastLock("air-studio-discovery");
            multicast.setReferenceCounted(false);
        }
        multicast.acquire();
    }

    private synchronized void releaseMulticast() {
        if (multicast != null && multicast.isHeld()) multicast.release();
    }

    @SuppressWarnings("deprecation")
    private String wifiAddress() {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        for (Network network : manager.getAllNetworks()) {
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            LinkProperties properties = manager.getLinkProperties(network);
            if (capabilities == null || properties == null || !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            for (LinkAddress link : properties.getLinkAddresses()) {
                if (link.getAddress() instanceof Inet4Address && link.getAddress().isSiteLocalAddress())
                    return link.getAddress().getHostAddress();
            }
        }
        return null;
    }

    @PluginMethod
    public void request(PluginCall call) {
        String path = call.getString("path", "");
        String method = call.getString("method", "GET");
        String body = call.getString("body", "{}");
        boolean discovery = path.equals("/discovery") && method.equals("POST");
        worker.execute(() -> {
            if (!active) { call.reject("Resume the app to connect to your purifier."); return; }
            try {
                String requestBody = body;
                if (discovery) {
                    String address = wifiAddress();
                    if (address == null) { call.reject("Connect to the purifier Wi-Fi network with an IPv4 address before scanning."); return; }
                    requestBody = new JSONObject(body).put("interface", address).toString();
                    acquireMulticast();
                }
                if (!Python.isStarted()) Python.start(new AndroidPlatform(getContext()));
                String stored = store.read();
                String response = Python.getInstance().getModule("purifier_adapter")
                    .callAttr("dispatch", stored, path, method, requestBody).toString();
                JSONObject envelope = new JSONObject(response);
                if (discovery && !active) { call.reject("Resume the app and scan again."); return; }
                if (envelope.has("error")) { call.reject(envelope.getString("error")); return; }
                String updated = envelope.getJSONObject("state").toString();
                if (!updated.equals(stored)) store.write(updated);
                // Never forward the private state or token to JavaScript.
                JSObject result = new JSObject();
                result.put("result", envelope.get("result"));
                call.resolve(result);
            } catch (Exception error) {
                // Do not pass an exception to reject: Capacitor may log it.
                call.reject("Unable to open or save the encrypted device store or initialize local control. Saved data has been retained.");
            } finally {
                if (discovery) releaseMulticast();
            }
        });
    }
}
