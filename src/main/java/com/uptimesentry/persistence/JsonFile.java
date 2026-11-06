package com.uptimesentry.persistence;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.function.Supplier;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.uptimesentry.util.SentryLogger;

/** Reads and writes small JSON data files next to the app's other data. Writes go through a temp file. */
public final class JsonFile {

    static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private JsonFile() {
    }

    /** The file's content, or {@code fallback} when it is missing or unreadable. */
    public static <T> T read(Path file, Type type, Supplier<T> fallback) {
        if (!Files.exists(file)) return fallback.get();
        try {
            T value = GSON.fromJson(Files.readString(file, StandardCharsets.UTF_8), type);
            return value != null ? value : fallback.get();
        } catch (IOException | JsonParseException e) {
            SentryLogger.error("Couldn't read " + file + ": " + e.getMessage());
            return fallback.get();
        }
    }

    public static void write(Path file, Object value) {
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Files.writeString(tmp, GSON.toJson(value), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            SentryLogger.error("Couldn't save " + file + ": " + e.getMessage());
        }
    }

    public static void delete(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            SentryLogger.warn("Couldn't delete " + file + ": " + e.getMessage());
        }
    }
}
