package com.uptimesentry.service;

import java.io.File;
import java.io.InputStream;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.Clip;
import javax.sound.sampled.FloatControl;

public class AudioPlayer {

    public static synchronized void play(String soundName, String type, float volumePercent) {
        new Thread(() -> {
            try {
                // Volume conversion: volumePercent is 0.0 to 1.0. Decibel range: -80dB to 6dB
                float volume = Math.max(0.0001f, Math.min(1.0f, volumePercent));
                float dB = (float) (Math.log10(volume) * 20.0);

                // Attempt to load from resources first, then fall back to absolute path on disk
                InputStream is = AudioPlayer.class.getResourceAsStream("/audio/notification/" + type + "/" + soundName);
                AudioInputStream audioIn = null;

                if (is != null) {
                    audioIn = AudioSystem.getAudioInputStream(is);
                } else {
                    // Check local filesystem
                    File file = new File("src/main/resources/audio/notification/" + type + "/" + soundName);
                    if (!file.exists()) {
                        file = new File("audio/notification/" + type + "/" + soundName);
                    }
                    if (file.exists()) {
                        audioIn = AudioSystem.getAudioInputStream(file);
                    }
                }

                if (audioIn == null) {
                    System.err.println("Sound file not found: " + soundName);
                    return;
                }

                Clip clip = AudioSystem.getClip();
                clip.open(audioIn);

                if (clip.isControlSupported(FloatControl.Type.MASTER_GAIN)) {
                    FloatControl gainControl = (FloatControl) clip.getControl(FloatControl.Type.MASTER_GAIN);
                    gainControl.setValue(dB);
                }

                clip.start();
            } catch (Exception e) {
                System.err.println("Failed to play audio alert: " + e.getMessage());
            }
        }).start();
    }
}
