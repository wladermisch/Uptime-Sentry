package com.uptimesentry.api;

import io.javalin.http.Context;
import java.io.File;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.uptimesentry.persistence.SettingsRepository;
import com.uptimesentry.service.AudioPlayer;

public class AudioController {

    /** Folder (next to the app's data) that holds sounds people added themselves. */
    static final String CUSTOM_DIR = "audio/notification/";
    private static final long MAX_UPLOAD_BYTES = 5L * 1024 * 1024;

    /** GET /api/audio/list: built-in and added sounds per type, plus which ones were added. */
    public void listSounds(Context ctx) {
        Map<String, Object> result = new HashMap<>();
        Map<String, List<String>> custom = new HashMap<>();
        for (String type : List.of("up", "down")) {
            List<String> added = customSoundFiles(type);
            List<String> all = new ArrayList<>(getSoundFiles(type));
            for (String a : added) if (!all.contains(a)) all.add(a);
            result.put(type, all);
            custom.put(type, added);
        }
        result.put("custom", custom);
        ctx.json(result);
    }

    /**
     * POST /api/audio/upload?type=up|down&amp;name=file.wav with the WAV file as the request body.
     * Stored in audio/notification/{type}/ next to the service's data.
     */
    public void uploadSound(Context ctx) {
        String type = ctx.queryParam("type");
        String name = ctx.queryParam("name");
        if (!"up".equals(type) && !"down".equals(type)) { ctx.status(400).result("type must be up or down"); return; }
        String safe = safeFileName(name);
        if (safe == null) { ctx.status(400).result("Use a .wav file with a plain file name."); return; }
        byte[] data = ctx.bodyAsBytes();
        if (data.length == 0 || data.length > MAX_UPLOAD_BYTES) { ctx.status(400).result("The sound must be a WAV file under 5 MB."); return; }
        try (javax.sound.sampled.AudioInputStream in = javax.sound.sampled.AudioSystem.getAudioInputStream(new java.io.ByteArrayInputStream(data))) {
            if (in.getFormat() == null) throw new IllegalArgumentException();
        } catch (Exception e) {
            ctx.status(400).result("This file can't be played. Use an uncompressed WAV file.");
            return;
        }
        try {
            java.nio.file.Path dir = java.nio.file.Paths.get(CUSTOM_DIR + type);
            java.nio.file.Files.createDirectories(dir);
            java.nio.file.Files.write(dir.resolve(safe), data);
            ctx.json(Map.of("name", safe, "type", type));
        } catch (Exception e) {
            ctx.status(500).result("Couldn't save the sound: " + e.getMessage());
        }
    }

    /** Keeps only a bare "name.wav" made of ordinary characters; null if that isn't possible. */
    static String safeFileName(String name) {
        if (name == null) return null;
        String base = new File(name.replace('\\', '/')).getName().trim();
        if (!base.toLowerCase().endsWith(".wav")) return null;
        String stem = base.substring(0, base.length() - 4).replaceAll("[^A-Za-z0-9 _.()-]", "_").trim();
        if (stem.isEmpty() || stem.startsWith(".")) return null;
        if (stem.length() > 60) stem = stem.substring(0, 60);
        return stem + ".wav";
    }

    private List<String> customSoundFiles(String type) {
        List<String> list = new ArrayList<>();
        File dir = new File(CUSTOM_DIR + type);
        File[] files = dir.isDirectory() ? dir.listFiles((d, n) -> n.toLowerCase().endsWith(".wav")) : null;
        if (files != null) for (File f : files) list.add(f.getName());
        list.sort(String::compareToIgnoreCase);
        return list;
    }

    public void streamSound(Context ctx) {
        String type = ctx.queryParam("type");
        String file = ctx.queryParam("file");

        if (type == null || file == null) {
            ctx.status(400).result("Missing type or file parameter");
            return;
        }
        if (!("up".equals(type) || "down".equals(type)) || file.contains("/") || file.contains("\\") || file.contains("..")) {
            ctx.status(400).result("Invalid sound name");
            return;
        }

        try {
            // First try reading from classpath
            InputStream is = AudioController.class.getResourceAsStream("/audio/notification/" + type + "/" + file);
            if (is != null) {
                ctx.contentType("audio/wav");
                ctx.result(is);
                return;
            }

            // Fallback to local files
            File localFile = new File("src/main/resources/audio/notification/" + type + "/" + file);
            if (!localFile.exists()) {
                localFile = new File("audio/notification/" + type + "/" + file);
            }

            if (localFile.exists()) {
                ctx.contentType("audio/wav");
                ctx.result(new java.io.FileInputStream(localFile));
            } else {
                ctx.status(404).result("Sound file not found: " + file);
            }
        } catch (Exception e) {
            ctx.status(500).result("Error streaming audio: " + e.getMessage());
        }
    }

    public void playSound(Context ctx) {
        try {
            Map<String, String> body = ctx.bodyAsClass(HashMap.class);
            String file = body.get("file");
            String type = body.get("type"); // up or down

            if (file == null || type == null) {
                ctx.status(400).result("Missing file or type parameter");
                return;
            }
            if (!("up".equals(type) || "down".equals(type)) || file.contains("/") || file.contains("\\") || file.contains("..")) {
                ctx.status(400).result("Invalid sound name");
                return;
            }

            // Check if file exists in resources or local filesystem
            boolean exists = AudioController.class.getResource("/audio/notification/" + type + "/" + file) != null;
            if (!exists) {
                exists = new File("src/main/resources/audio/notification/" + type + "/" + file).exists();
            }
            if (!exists) {
                exists = new File("audio/notification/" + type + "/" + file).exists();
            }

            if (!exists) {
                ctx.status(404).result("Sound file not found: " + file);
                return;
            }

            float volume = SettingsRepository.loadSettings().volume;
            AudioPlayer.play(file, type, volume);
            ctx.status(200).result("Playing: " + file);
        } catch (Exception e) {
            ctx.status(500).result("Failed to play: " + e.getMessage());
        }
    }

    private List<String> getSoundFiles(String type) {
        List<String> list = new ArrayList<>();
        // Scan directory on disk
        File dir = new File("src/main/resources/audio/notification/" + type);

        if (dir.exists() && dir.isDirectory()) {
            File[] files = dir.listFiles((d, name) -> name.endsWith(".wav"));
            if (files != null) {
                for (File f : files) {
                    list.add(f.getName());
                }
            }
        }

        // Fallback default list if empty (e.g. running packaged jar classpath scanning issues)
        if (list.isEmpty()) {
            if ("up".equalsIgnoreCase(type)) {
                list.add("Up-Default.wav");
                list.add("Up2.wav");
                list.add("Up3.wav");
                list.add("Notification Modern.wav");
                list.add("Notification1.wav");
                list.add("Notification2.wav");
            } else {
                list.add("Down-Default.wav");
                list.add("Down Modern.wav");
                list.add("Down-2.wav");
                list.add("Down3.wav");
                list.add("Critical-Alert.wav");
                list.add("Error.wav");
                list.add("Notification Modern.wav");
                list.add("Notification Warning.wav");
                list.add("Notification1.wav");
                list.add("Notification2.wav");
            }
        }
        return list;
    }
}
