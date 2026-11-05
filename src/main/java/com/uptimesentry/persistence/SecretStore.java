package com.uptimesentry.persistence;

import com.github.javakeyring.BackendNotSupportedException;
import com.github.javakeyring.Keyring;
import com.github.javakeyring.KeyringStorageType;
import com.github.javakeyring.PasswordAccessException;
import com.uptimesentry.util.SentryLogger;

/**
 * Keeps secrets (the SMTP password) in the operating system's credential store instead of a file:
 * Windows Credential Manager, macOS Keychain, or the Secret Service keyring (GNOME Keyring / KWallet)
 * on Linux. The store encrypts the secret for the signed-in user.
 *
 * A password can't be hashed here: it has to be sent to the mail server as typed. When no credential
 * store is available, the secret is kept in memory only (never written to disk) and must be re-entered
 * after a restart.
 */
public final class SecretStore {

    private static final String SERVICE = "Uptime Sentry";
    public static final String SMTP_PASSWORD = "smtp-password";

    private static Keyring keyring;
    private static boolean probed;
    /** Fallback when the OS has no usable store; lost on restart by design. */
    private static final java.util.Map<String, String> MEMORY = new java.util.concurrent.ConcurrentHashMap<>();

    private SecretStore() {
    }

    private static synchronized Keyring keyring() {
        if (!probed) {
            probed = true;
            try {
                keyring = Keyring.create();
            } catch (BackendNotSupportedException | RuntimeException | LinkageError e) {
                SentryLogger.warn("No system credential store available (" + e.getMessage() + "); the mail password is kept in memory only.");
                keyring = null;
            }
        }
        return keyring;
    }

    /** Name of the store in use, for the settings screen, or null when only memory is available. */
    public static String storeName() {
        Keyring k = keyring();
        if (k == null) return null;
        KeyringStorageType t = k.getKeyringStorageType();
        if (t == null) return "system credential store";
        return switch (t) {
            case WINDOWS_CREDENTIAL_STORE -> "Windows Credential Manager";
            case OSX_KEYCHAIN, LEGACY_OSX_KEYCHAIN -> "macOS Keychain";
            case GNOME_KEYRING -> "Secret Service keyring";
            case KWALLET -> "KWallet";
        };
    }

    /** Stores the secret, or removes it when value is null or empty. Returns false if the OS store refused. */
    public static synchronized boolean put(String key, String value) {
        boolean clear = value == null || value.isEmpty();
        Keyring k = keyring();
        if (k == null) {
            if (clear) MEMORY.remove(key); else MEMORY.put(key, value);
            return true;
        }
        try {
            if (clear) {
                if (get(key) != null) k.deletePassword(SERVICE, key);
            } else {
                k.setPassword(SERVICE, key, value);
            }
            MEMORY.remove(key);
            return true;
        } catch (PasswordAccessException | RuntimeException e) {
            SentryLogger.error("Couldn't save to the system credential store: " + e.getMessage() + ". Kept in memory until restart.");
            if (clear) MEMORY.remove(key); else MEMORY.put(key, value);
            return false;
        }
    }

    /** The stored secret, or null when there is none. */
    public static synchronized String get(String key) {
        String mem = MEMORY.get(key);
        if (mem != null) return mem;
        Keyring k = keyring();
        if (k == null) return null;
        try {
            String v = k.getPassword(SERVICE, key);
            return v == null || v.isEmpty() ? null : v;
        } catch (PasswordAccessException | RuntimeException e) {
            return null; // Not stored (the backends report a missing entry as an access error).
        }
    }

    public static boolean has(String key) {
        return get(key) != null;
    }
}
