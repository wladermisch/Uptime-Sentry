package com.uptimesentry.service;

import java.awt.AWTException;
import java.awt.Image;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.io.IOException;

import javax.imageio.ImageIO;

import com.uptimesentry.model.MonitoredTarget;

public class NotificationService {

    private final TrayIcon trayIcon;

    public NotificationService() {
        this.trayIcon = SystemTray.isSupported() ? createTrayIcon() : null;
    }

    public void notifyFailure(MonitoredTarget target) {
        sendNotification("Target offline (failure)", target.getName() + " is offline.", TrayIcon.MessageType.ERROR);
    }

    public void notifyRecovery(MonitoredTarget target) {
        sendNotification("Target recovered", target.getName() + " is back online.", TrayIcon.MessageType.INFO);
    }

    public void notifyOffline(MonitoredTarget target) {
        sendNotification("Target offline", target.getName() + " is offline.", TrayIcon.MessageType.WARNING);
    }

    public void notifyOnline(MonitoredTarget target) {
        sendNotification("Target online", target.getName() + " is online.", TrayIcon.MessageType.INFO);
    }

    private void sendNotification(String title, String message, TrayIcon.MessageType messageType) {
        if (trayIcon != null) {
            trayIcon.displayMessage(title, message, messageType);
            return;
        }

        System.out.println(title + ": " + message);
    }

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

    private Image createTrayImage() {
        try {
            return ImageIO.read(getClass().getResource("/icons/tray-16.png"));
        } catch (IOException e) {
            return null;
        }
    }
}