use std::{
    env, fs,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct SidecarState(Mutex<Option<CommandChild>>);

fn resolve_data_dir() -> PathBuf {
    if let Some(configured) = env::var_os("LODESTAR_DATA_DIR")
        .or_else(|| env::var_os("KLEIN_DATA_DIR"))
        .or_else(|| env::var_os("AUTOMATION_STUDIO_DATA_DIR"))
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(configured);
    }

    // Preserve the existing D:\...\app + D:\...\data portable layout.
    if let Ok(executable) = env::current_exe() {
        if let Some(app_dir) = executable.parent() {
            if app_dir.file_name().is_some_and(|name| name == "app") {
                if let Some(root) = app_dir.parent() {
                    return root.join("data");
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        return env::var_os("LOCALAPPDATA")
            .or_else(|| env::var_os("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or_else(env::temp_dir)
            .join("Lodestar");
    }

    #[cfg(not(target_os = "windows"))]
    env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("Lodestar")
}

fn start_sidecar(
    app: &tauri::AppHandle,
    data_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(data_dir)?;
    let bundled_browser_dir = app
        .path()
        .resource_dir()
        .ok()
        .map(|directory| directory.join("browsers"))
        .filter(|directory| directory.is_dir());
    let browser_dir = bundled_browser_dir.unwrap_or_else(|| data_dir.join("browsers"));
    let command = app
        .shell()
        .sidecar("lodestar-sidecar")?
        .args(["--server"])
        .env("AUTOMATION_STUDIO_MODE", "production")
        .env("AUTOMATION_STUDIO_DATA_DIR", data_dir.as_os_str())
        .env("PLAYWRIGHT_BROWSERS_PATH", browser_dir.as_os_str())
        .env("AUTOMATION_STUDIO_HOST", "127.0.0.1")
        .env("AUTOMATION_STUDIO_PORT", "8765");
    let (_events, child) = command.spawn()?;
    *app.state::<SidecarState>().0.lock().unwrap() = Some(child);
    Ok(())
}

fn stop_sidecar(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<SidecarState>().0.lock().unwrap().take() {
        #[cfg(target_os = "windows")]
        {
            let status = Command::new("taskkill.exe")
                .args(["/PID", &child.pid().to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .status();
            if status.is_ok_and(|value| value.success()) {
                return;
            }
        }
        let _ = child.kill();
    }
}

fn splash_duration_for_launch(data_dir: &Path) -> Duration {
    let state_path = data_dir.join("startup-state.json");
    let existing_install = data_dir.join("studio.db").exists()
        || data_dir.join("klein").join("capabilities.json").exists();
    let first_install_launch = !state_path.exists() && !existing_install;
    let random_seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seconds = if first_install_launch {
        25
    } else {
        10 + (random_seed % 16) as u64
    };
    let state = format!(
        "{{\n  \"first_install_launch\": {},\n  \"last_delay_seconds\": {}\n}}\n",
        first_install_launch, seconds
    );
    let _ = fs::write(state_path, state);
    Duration::from_secs(seconds)
}

fn reveal_when_ready(app: tauri::AppHandle, splash_duration: Duration) {
    thread::spawn(move || {
        let splash_started_at = Instant::now();
        let address: SocketAddr = "127.0.0.1:8765".parse().unwrap();
        for _ in 0..120 {
            if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let elapsed = splash_started_at.elapsed();
        if elapsed < splash_duration {
            thread::sleep(splash_duration - elapsed);
        }
        if let Some(splash) = app.get_webview_window("splashscreen") {
            let _ = splash.hide();
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示 Lodestar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("Lodestar");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}

pub fn run() {
    let data_dir = resolve_data_dir();
    let webview_data_dir = data_dir.join("webview");
    let local_app_data_dir = data_dir.join("localappdata");
    let roaming_app_data_dir = data_dir.join("roaming");
    let window_state_path = data_dir.join("window-state.json");
    let has_saved_window_state = window_state_path.exists();
    let _ = fs::create_dir_all(&webview_data_dir);
    let _ = fs::create_dir_all(&local_app_data_dir);
    let _ = fs::create_dir_all(&roaming_app_data_dir);
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_data_dir);
    std::env::set_var("LOCALAPPDATA", &local_app_data_dir);
    std::env::set_var("APPDATA", &roaming_app_data_dir);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .with_filename(window_state_path.to_string_lossy())
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            let splash_duration = splash_duration_for_launch(&data_dir);
            build_tray(app)?;
            if let Some(splash) = app.get_webview_window("splashscreen") {
                let _ = splash.set_fullscreen(false);
                let _ = splash.unmaximize();
                let scale_factor = splash.scale_factor().unwrap_or(1.0);
                let _ = splash.set_size(tauri::PhysicalSize::new(
                    (520.0 * scale_factor).round() as u32,
                    (760.0 * scale_factor).round() as u32,
                ));
                let _ = splash.set_zoom(1.0);
                let _ = splash.center();
                let progress_script = format!(
                    "document.documentElement.style.setProperty('--splash-duration', '{}s');",
                    splash_duration.as_secs()
                );
                let _ = splash.eval(&progress_script);
            }
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window_vibrancy::apply_mica(&window, Some(true));
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_fullscreen(false);
                let _ = window.unmaximize();
                let _ = window.set_zoom(1.0);
                if !has_saved_window_state {
                    let scale_factor = window.scale_factor().unwrap_or(1.0);
                    let _ = window.set_size(tauri::PhysicalSize::new(
                        (1320.0 * scale_factor).round() as u32,
                        (820.0 * scale_factor).round() as u32,
                    ));
                    let _ = window.center();
                }
            }
            start_sidecar(app.handle(), &data_dir).map_err(|error| error.to_string())?;
            reveal_when_ready(app.handle().clone(), splash_duration);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Lodestar desktop runtime");

    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            stop_sidecar(app);
        }
    });
}
