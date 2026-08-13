# Uptime-Sentry

A lightweight uptime monitoring application for administrators and power users to track the availability and response times of websites and local network devices. The application features a Java-based backend API server coupled with a modern Tauri and React desktop GUI.

## Overview

Uptime-Sentry enables you to automatically monitor the reachability and performance of web services and local network devices (routers, NAS drives, personal servers, etc.) without manual browser checks. The application runs directly on your device, perfect for developers and IT professionals who need real-time visibility into critical services.

## Key Features

### Desktop Dashboard UI
- **Modern React Interface**: A responsive dashboard powered by Vite, Material UI (MUI), and TypeScript.
- **Analytics & History**: Interactive response charts, average latency metrics, and detailed incident history with post-mortem logs.
- **SLA Reporting**: Export professional SLA reports of profiles or individual targets in PDF, Markdown, or plain text formats.
- **Real-Time Diagnostics**: Instant connectivity checks and status validation as you configure target URL/IP addresses.

### Monitoring Methods
- **Server Pings**: Simple ICMP ping requests to check device availability.
- **HTTP Requests**: Targeted monitoring with HTTP status code analysis.
- **Configurable Timeouts**: Define how long a target can be unresponsive before triggering an alarm.

### Profiles & Targets Management
- **Monitoring Profiles**: Create, edit, and switch between separate monitoring environments (such as Standard and Dev profiles).
- **Background Checks**: Option to continue running background checks for inactive profiles even when a different profile is selected.
- **Default & Custom Alerts**: Configure default notification sounds globally per profile, or select custom WAV sounds for individual targets.

### Notifications & System Integration
- **Immediate Alerts**: Desktop notification popups via the system tray.
- **Audio Alerts**: Play warning/recovery sounds when monitoring states change.
- **Email Forwarding**: Automatically forward detailed outage reports to a recipient email.
- **Windows Integration**: Auto-start options to launch Uptime-Sentry minimized in the system tray when Windows boots.
- **Log Retention**: Customizable data retention limit configurations to manage history database size.

### Automated Actions
- Execute custom shell command scripts on target failure (e.g., to restart a crashed service).
- Run PowerShell scripts or batch files automatically.

## Technology Stack

- **Backend**: Java 21, Javalin (REST API Server), Jackson (JSON serialization)
- **Frontend**: React, Vite, Material UI (MUI), TypeScript
- **Desktop Shell**: Tauri v2, Rust
- **Packaging**: Inno Setup

## Getting Started

### Installation

1. **Install Java 21 or later**
   - Download and install Java from [adoptium.net](https://adoptium.net/)

2. **Download the Setup Installer**
   - Get the latest installer executable `UptimeSentry_Setup_v[version].exe` from [github.com/wladermisch/Uptime-Sentry/releases](https://github.com/wladermisch/Uptime-Sentry/releases)

3. **Run the Installer**
   - Run the setup installer. The app will launch both the Tauri desktop client and start the embedded Java API backend in the background.

### Running CLI / Backend Directly

To run the Java application directly from a terminal:

- **Interactive Console Menu**:
  ```
  java -jar uptimesentry.jar
  ```
- **REST API Only Mode** (port 8765):
  ```
  java -jar uptimesentry.jar --api
  ```

## Build and Release

To build a release package and compile the desktop installer:

1. **Prerequisites**: Ensure the following tools are installed and configured on your PATH:
   - Python 3
   - Node.js & npm
   - Java 21 JDK & Maven (mvn)
   - Inno Setup 6 (for packaging)
   - Git & GitHub CLI (optional, for git tags and automated release publishing)

2. **Run Release Script**:
   Run the batch script wrapper at the root of the repository:
   ```cmd
   release.bat
   ```
3. **Follow the Prompts**:
   Enter the desired target version (e.g. `0.3.1`). The script will automatically:
   - Sync the version string in configuration files (`package.json`, `tauri.conf.json`, `Cargo.toml`, `pom.xml`) and TypeScript source code.
   - Build the Java backend fat JAR.
   - Build the Tauri release package.
   - Assemble the build artifacts in a distribution directory.
   - Compile the Inno Setup installer.
   - Commit, tag, and push version updates to Git.
   - Create a GitHub release and upload the compiled setup installer.
