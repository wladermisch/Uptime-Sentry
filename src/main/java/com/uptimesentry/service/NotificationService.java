package com.uptimesentry.service;

import java.awt.AWTException;
import java.awt.Image;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.io.IOException;

import javax.imageio.ImageIO;

import com.uptimesentry.model.MonitoredTarget;

public class NotificationService {

    private final TrayIcon trayIcon; // We use a TrayIcon for desktop notifications. If SystemTray is not supported, this will be null and we will fallback to console output.

    public NotificationService() {
        this.trayIcon = SystemTray.isSupported() ? createTrayIcon() : null;
    }

    private String getTitlePrefix(MonitoredTarget target) {
        return (target.getProfileName() != null && !target.getProfileName().isEmpty())
            ? "[" + target.getProfileName() + "] " : "";
    }

    public void notifyFailure(MonitoredTarget target) {
        sendNotification(getTitlePrefix(target) + "Target offline (failure)", target.getName() + " is offline.", TrayIcon.MessageType.ERROR);
        playSoundAlert(target, "down");
    }

    public void notifyRecovery(MonitoredTarget target) {
        sendNotification(getTitlePrefix(target) + "Target recovered", target.getName() + " is back online.", TrayIcon.MessageType.INFO);
        playSoundAlert(target, "up");
    }

    public void notifyOffline(MonitoredTarget target) {
        sendNotification(getTitlePrefix(target) + "Target offline", target.getName() + " is offline.", TrayIcon.MessageType.WARNING);
        playSoundAlert(target, "down");
    }

    public void notifyOnline(MonitoredTarget target) {
        sendNotification(getTitlePrefix(target) + "Target online", target.getName() + " is online.", TrayIcon.MessageType.INFO);
        playSoundAlert(target, "up");
    }

    private void playSoundAlert(MonitoredTarget target, String type) {
        com.uptimesentry.persistence.SettingsRepository.AppSettings settings = 
            com.uptimesentry.persistence.SettingsRepository.loadSettings();
        if (!settings.playSoundAlert) {
            return;
        }

        String soundName = "up".equals(type) ? target.getUpSound() : target.getDownSound();
        if (soundName == null || soundName.trim().isEmpty()) {
            soundName = "up".equals(type) ? "Up-Default.wav" : "Down-Default.wav";
        }

        boolean exists = getClass().getResource("/audio/notification/" + type + "/" + soundName) != null;
        if (!exists) {
            exists = new java.io.File("src/main/resources/audio/notification/" + type + "/" + soundName).exists();
        }
        if (!exists) {
            exists = new java.io.File("audio/notification/" + type + "/" + soundName).exists();
        }

        if (!exists) {
            sendNotification(
                "Sound File Missing",
                "Alert sound '" + soundName + "' is missing or moved. Default sound used instead.",
                TrayIcon.MessageType.WARNING
            );
            soundName = "up".equals(type) ? "Up-Default.wav" : "Down-Default.wav";
        }

        AudioPlayer.play(soundName, type, settings.volume);
    }
    // Helper method to send a notification. If trayIcon is available, it uses that, otherwise it falls back to printing to the console.
    private void sendNotification(String title, String message, TrayIcon.MessageType messageType) {
        if (trayIcon != null) {
            trayIcon.displayMessage(title, message, messageType);
            return;
        }

        System.out.println(title + ": " + message);
    }
    // Helper method to create a TrayIcon. It loads an image from the resources and adds it to the system tray. If any step fails, it returns null, which indicates that desktop notifications are not available.
    private TrayIcon createTrayIcon() {
        Image image = createTrayImage();
        if (image == null) {
            return null;
        }

        TrayIcon icon = new TrayIcon(image, "Uptime Sentry");
        icon.setImageAutoSize(true);

        try {
            SystemTray.getSystemTray().add(icon);
        } catch (AWTException e) {
            return null;
        }

        return icon;
    }
    // Helper method to load the tray icon image from the resources. It attempts to read the image file and returns it. If it fails (e.g., file not found), it returns null.
    private Image createTrayImage() {
        try {
            return ImageIO.read(getClass().getResource("/icons/tray-16.png"));
        } catch (IOException e) {
            return null;
        }
    }
}