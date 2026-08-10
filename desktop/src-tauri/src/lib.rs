#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use std::io::Write;

use tauri::{AppHandle, Manager, State, WindowEvent};

// ── App state ────────────────────────────────────────────────────────────────

#[derive(Default)]
struct AppState {
    allow_exit: AtomicBool,
    java_process: Mutex<Option<Child>>,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Returns the path to uptimesentry.jar — sibling of the Tauri binary in production,
/// or relative to the workspace root in development.
fn find_jar() -> Option<PathBuf> {
    // 1. Same directory as the executable (production / installed)
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe.parent()?.join("uptimesentry.jar");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // 2. Development: two levels up from desktop/ → UptimeSentry/Uptime-Sentry/target/
    let dev_candidate = PathBuf::from("../../Uptime-Sentry/target/uptimesentry.jar");
    if dev_candidate.exists() {
        return Some(dev_candidate);
    }

    None
}

/// Finds the java.exe binary path.
fn find_java_exe() -> PathBuf {
    if let Ok(val) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(val).join("bin").join("java.exe");
        if p.exists() {
            return p;
        }
    }
    let fallback = PathBuf::from("C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.12.8-hotspot\\bin\\java.exe");
    if fallback.exists() {
        return fallback;
    }
    PathBuf::from("java")
}

/// Launch the Java API server as a background subprocess.
fn launch_java(state: &AppState) {
    let jar = match find_jar() {
        Some(p) => p,
        None => {
            eprintln!("[UptimeSentry] uptimesentry.jar not found — backend not started.");
            return;
        }
    };

    let java_bin = find_java_exe();
    println!("[UptimeSentry] Launching Java backend: {:?} with {:?}", jar, java_bin);

    let child = Command::new(java_bin)
        .arg("-jar")
        .arg(&jar)
        .arg("--api")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn();

    match child {
        Ok(c) => {
            *state.java_process.lock().unwrap() = Some(c);
            // Wait until the API port is open (up to 10 s)
            wait_for_port(8765, 100);
            println!("[UptimeSentry] Java backend ready on port 8765.");
        }
        Err(e) => eprintln!("[UptimeSentry] Failed to start Java backend: {e}"),
    }
}

/// Poll localhost:PORT until it accepts connections or timeout is reached.
fn wait_for_port(port: u16, max_attempts: u32) {
    for _ in 0..max_attempts {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Request graceful shutdown via the REST endpoint.
fn request_backend_shutdown() {
    const SHUTDOWN_REQUEST: &str =
        "POST /api/runtime/shutdown HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", 8765_u16)) {
        let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
        let _ = stream.write_all(SHUTDOWN_REQUEST.as_bytes());
    }
}

/// Kill the Java subprocess directly if still running.
fn kill_java(state: &AppState) {
    if let Ok(mut guard) = state.java_process.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn cleanup(state: &AppState) {
    request_backend_shutdown();
    std::thread::sleep(Duration::from_millis(400));
    kill_java(state);
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn quit_application(app: AppHandle, state: State<AppState>) {
    cleanup(&state);
    state.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![quit_application])
        .setup(|app| {
            let state = app.state::<AppState>();
            launch_java(&state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if !state.allow_exit.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Uptime Sentry");
}
