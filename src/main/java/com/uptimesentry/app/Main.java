package com.uptimesentry.app;

/**
 * Main is the application entry point.
 * It initializes the application and starts the console menu loop.
 */
public class Main {
    
    /**
     * Main method - program entry point.
     * 
     * Prints a welcome message, initializes the console menu, and starts the menu loop.
     */
    public static void main(String[] args) {
        System.out.println("========================================");
        System.out.println("     Welcome to Uptime-Sentry");
        System.out.println("========================================");
        System.out.println();
        
        ConsoleMenu menu = new ConsoleMenu();
        try {
            menu.loop();
        } finally {
            menu.close();
            System.out.println("\nGoodbye!");
        }
    }
}
