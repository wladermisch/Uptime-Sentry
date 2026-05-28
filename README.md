# Uptime-Sentry

A lightweight Java-based uptime monitoring application for administrators and power users to track the availability and response times of websites and local network devices.

## Overview

Uptime-Sentry enables you to automatically monitor the reachability and performance of web services and local network devices (routers, NAS drives, personal servers, etc.) without manual browser checks. The application runs directly on your device, perfect for developers and IT professionals who need real-time visibility into critical services.

## Key Features

### Monitoring Methods
- **Server Pings**: Simple ICMP ping requests to check device availability
- **HTTP Requests**: Targeted monitoring with HTTP status code analysis (200, 404, 500, etc.)
- **Configurable Timeouts**: Define how long a target can be unresponsive before triggering an alarm

### Notifications
- **Immediate Alerts**: Get notified as soon as a service goes down
- **Delayed Notifications**: Optional time-based alert delays based on configuration
- **Recovery Notifications**: Automatic alerts when services come back online
- **Important Info**: As of now, I used AWT for Tray and Notifications, which highly likely wont work on Linux (I dont know about Mac). (as a fallback, it will just write into console, but notifications for Linux may be added later.)
- 

### Automated Actions
- Execute custom system commands on failure (e.g., restart a crashed server)
- Run PowerShell scripts or batch files automatically
- Integrate with external automation tools

### Configuration Management
- **JSON-Based Config**: All settings stored in easy-to-read JSON format
- **External Editing**: Modify monitoring profiles outside the application
- **Persistent Storage**: Configurations saved between sessions

## User Interface
- Console-based menu system for easy navigation
- Manage monitored targets (add, edit, remove)
- View monitoring history and results
- Simple start/stop controls

## Getting Started

[Setup instructions coming soon]

## Technology Stack
- **Language**: Java
- **Configuration**: JSON
- **User Interface**: Console Application
