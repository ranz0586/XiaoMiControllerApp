package com.airstudio.purifier;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.AEADBadTagException;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeIntegrationTest {
    @Test public void encryptedStoreAndBundledAdapterWorkWithoutHardware() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String suffix = UUID.randomUUID().toString();
        String filename = "test-purifiers-" + suffix + ".enc";
        String alias = "air-studio-test-" + suffix;
        File testFile = new File(context.getNoBackupFilesDir(), filename);
        SecureStore store = new SecureStore(context, filename, alias);
        try {
            if (!Python.isStarted()) Python.start(new AndroidPlatform(context));
            String empty = "{\"devices\":[],\"history\":{}}";
            String fakeToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
            String body = "{\"name\":\"Fake test\",\"ip\":\"192.168.1.10\",\"model\":\"zhimi.airpurifier.ma2\",\"token\":\"" + fakeToken + "\"}";
            JSONObject added = new JSONObject(Python.getInstance().getModule("purifier_adapter")
                .callAttr("dispatch", empty, "/devices", "POST", body).toString());
            assertFalse(added.has("error"));
            assertFalse(added.getJSONObject("result").has("token"));
            String privateState = added.getJSONObject("state").toString();
            store.write(privateState);
            assertEquals(privateState, store.read());
            byte[] file;
            try (FileInputStream input = new FileInputStream(testFile);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int size;
                while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size);
                file = output.toByteArray();
            }
            assertFalse(new String(file, StandardCharsets.ISO_8859_1).contains(fakeToken));
            JSONObject models = new JSONObject(Python.getInstance().getModule("purifier_adapter")
                .callAttr("dispatch", store.read(), "/models", "GET", "{}").toString());
            assertTrue(models.getJSONArray("result").length() > 0);
            // Authentication must reject changed ciphertext, rather than showing
            // an empty configuration and silently falling back to demo mode.
            file[file.length - 1] ^= 1;
            try (FileOutputStream output = new FileOutputStream(testFile)) { output.write(file); }
            try {
                store.read();
                fail("Tampered ciphertext was accepted");
            } catch (AEADBadTagException expected) { /* authenticated encryption */ }
        } finally {
            new android.util.AtomicFile(testFile).delete();
            KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
            keys.load(null);
            keys.deleteEntry(alias);
        }
    }
}
