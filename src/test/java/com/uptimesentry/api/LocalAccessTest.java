package com.uptimesentry.api;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class LocalAccessTest {

    private static final String HOST = "127.0.0.1:8765";

    @Test
    void desktopAppAndToolsAreAllowed() {
        assertNull(LocalAccess.refusal("http://tauri.localhost", HOST));
        assertNull(LocalAccess.refusal("https://tauri.localhost", HOST));
        assertNull(LocalAccess.refusal("tauri://localhost", HOST));
        assertNull(LocalAccess.refusal("http://localhost:3000", HOST));
        // No Origin: the Tauri shell, PowerShell, curl.
        assertNull(LocalAccess.refusal(null, HOST));
        assertNull(LocalAccess.refusal(null, "localhost:8765"));
    }

    @Test
    void webPagesAreRefused() {
        assertNotNull(LocalAccess.refusal("https://evil.example", HOST));
        assertNotNull(LocalAccess.refusal("http://localhost:8080", HOST));
        // Sandboxed frames and file:// pages send "null".
        assertNotNull(LocalAccess.refusal("null", HOST));
    }

    @Test
    void foreignHostNamesAreRefused() {
        // DNS rebinding: a site's own name resolved to 127.0.0.1.
        assertNotNull(LocalAccess.refusal(null, "evil.example:8765"));
        assertNotNull(LocalAccess.refusal("http://tauri.localhost", "evil.example:8765"));
        assertNotNull(LocalAccess.refusal(null, null));
    }
}
