package com.uptimesentry.persistence;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import com.uptimesentry.model.CheckResult;

public class HistoryRepository {
    private static final Path HISTORY_FILE = Paths.get("history.json");
    private static final int MAX_HISTORY_ENTRIES = 200;

    public static synchronized List<CheckResult> loadHistory() {
        if (!Files.exists(HISTORY_FILE)) {
            List<CheckResult> seed = generateMockHistory();
            saveHistory(seed);
            return seed;
        }
        try {
            String json = Files.readString(HISTORY_FILE);
            Gson gson = new Gson();
            Type listType = new TypeToken<List<CheckResult>>() {}.getType();
            List<CheckResult> list = gson.fromJson(json, listType);
            return list != null ? list : new ArrayList<>();
        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    private static List<CheckResult> generateMockHistory() {
        List<CheckResult> list = new ArrayList<>();
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.format.DateTimeFormatter formatter = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        for (int i = 50; i >= 0; i--) {
            java.time.LocalDateTime ts = now.minusMinutes(i * 15L);
            String timestamp = ts.format(formatter);

            // Google DNS (Target ID: 1, PING)
            boolean t1Online = true;
            long t1Latency = 15 + (long)(Math.random() * 25);
            if (i >= 20 && i <= 22) {
                t1Online = false;
                t1Latency = 0;
            }
            list.add(new CheckResult(1, "Google DNS", timestamp, t1Online, t1Latency, t1Online ? "Ping success" : "Ping timeout"));

            // GitHub Portal (Target ID: 2, HTTP)
            boolean t2Online = true;
            long t2Latency = 80 + (long)(Math.random() * 120);
            if (i >= 35 && i <= 37) {
                t2Online = false;
                t2Latency = 0;
            }
            list.add(new CheckResult(2, "GitHub Portal", timestamp, t2Online, t2Latency, t2Online ? "HTTP 200" : "HTTP 502: Bad Gateway"));

            // Local API Service (Target ID: 3, HTTP)
            boolean t3Online = true;
            long t3Latency = 5 + (long)(Math.random() * 15);
            if (i >= 10 && i <= 11) {
                t3Online = false;
                t3Latency = 0;
            }
            list.add(new CheckResult(3, "Local API Service", timestamp, t3Online, t3Latency, t3Online ? "HTTP 200" : "HTTP 500: Internal Server Error"));
        }
        return list;
    }

    public static synchronized void addResult(CheckResult result) {
        List<CheckResult> history = loadHistory();
        history.add(0, result); // Add newest first
        if (history.size() > MAX_HISTORY_ENTRIES) {
            history = history.subList(0, MAX_HISTORY_ENTRIES);
        }
        saveHistory(history);
    }

    public static synchronized void saveHistory(List<CheckResult> history) {
        try {
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            String json = gson.toJson(history);
            Files.writeString(HISTORY_FILE, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            System.err.println("Failed to save history: " + e.getMessage());
        }
    }

    public static synchronized void clearHistory() {
        try {
            Files.deleteIfExists(HISTORY_FILE);
        } catch (IOException e) {
            System.err.println("Failed to clear history: " + e.getMessage());
        }
    }
}
