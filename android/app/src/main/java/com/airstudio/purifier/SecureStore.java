package com.airstudio.purifier;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Atomic authenticated encryption. Plaintext never goes to disk or preferences. */
final class SecureStore {
    private final String alias;
    private final AtomicFile file;

    SecureStore(Context context) {
        this(context, "purifiers.enc", "air-studio-device-store-v1");
    }

    // Tests use their own file and key, without reading or replacing user data.
    SecureStore(Context context, String filename, String alias) {
        this.alias = alias;
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), filename));
    }

    private SecretKey key() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        if (!keys.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) keys.getKey(alias, null);
    }

    String read() throws Exception {
        // openRead/readFully restores AtomicFile's legacy backup after a crash.
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) {
            return "{\"devices\":[],\"history\":{}}";
        }
        ByteBuffer bytes = ByteBuffer.wrap(file.readFully());
        int ivLength = bytes.get() & 0xff;
        if (ivLength != 12 || bytes.remaining() < ivLength + 16) throw new IllegalStateException();
        byte[] iv = new byte[ivLength]; bytes.get(iv);
        byte[] payload = new byte[bytes.remaining()]; bytes.get(payload);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(payload), StandardCharsets.UTF_8);
    }

    void write(String state) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(state.getBytes(StandardCharsets.UTF_8));
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(iv.length); output.write(iv); output.write(encrypted);
            file.finishWrite(output);
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            throw error;
        }
    }
}
