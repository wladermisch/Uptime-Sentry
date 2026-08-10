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

    public void listSounds(Context ctx) {
        Map<String, List<String>> result = new HashMap<>();
        result.put("up", getSoundFiles("up"));
        result.put("down", getSoundFiles("down"));
        ctx.json(result);
    }

    public void streamSound(Context ctx) {
        String type = ctx.queryParam("type");
        String file = ctx.queryParam("file");

        if (type == null || file == null) {
            ctx.status(400).result("Missing type or file parameter");
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
        if (!dir.exists()) {
            dir = new File("audio/notification/" + type);
        }

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
