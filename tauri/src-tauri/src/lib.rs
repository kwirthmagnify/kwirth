use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

fn find_free_port(start: u16) -> u16 {
    use std::net::TcpStream;
    for port in start..65535 {
        let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
        if TcpStream::connect_timeout(&addr, Duration::from_millis(30)).is_err() {
            return port;
        }
    }
    start
}

async fn wait_for_backend(port: u16) {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    loop {
        if let Ok(resp) = client
            .get(format!("http://localhost:{}/core/auth/method", port))
            .send()
            .await
        {
            if resp.status().is_success() {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

struct BackendChild(Mutex<Option<CommandChild>>);

#[tauri::command]
async fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
async fn kube_api_available(url: String) -> bool {
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_millis(2500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let probe_url = format!("{}/version", url.trim_end_matches('/'));
    match client.get(&probe_url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if status == 200 || status == 401 || status == 403 {
                match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        json.get("kind").and_then(|k| k.as_str()) == Some("Status")
                            || json.get("major").is_some()
                            || json.get("gitVersion").is_some()
                    }
                    Err(_) => false,
                }
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

#[tauri::command]
async fn store_get(app: AppHandle, key: String) -> Option<serde_json::Value> {
    let store_path = app.path().app_data_dir().ok()?.join("kwirth-store.json");
    let content = std::fs::read_to_string(&store_path).ok()?;
    let data: serde_json::Value = serde_json::from_str(&content).ok()?;
    data.get(&key).cloned()
}

#[tauri::command]
async fn store_set(app: AppHandle, key: String, value: serde_json::Value) -> bool {
    let Ok(store_dir) = app.path().app_data_dir() else {
        return false;
    };
    let _ = std::fs::create_dir_all(&store_dir);
    let store_path = store_dir.join("kwirth-store.json");
    let mut data: serde_json::Value = std::fs::read_to_string(&store_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    data[key] = value;
    std::fs::write(
        &store_path,
        serde_json::to_string_pretty(&data).unwrap_or_default(),
    )
    .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendChild(Mutex::new(None)))
        .setup(|app| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| std::path::PathBuf::from("."));
            // direct run: front/ is next to the exe (copied by build script)
            // installed:  front/ is under resources/ (Tauri array-format resources)
            let resource_dir = if exe_dir.join("front").join("index.html").exists() {
                exe_dir
            } else {
                exe_dir.join("resources")
            };
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let port = find_free_port(3883);
                println!("Kwirth Desktop: backend port = {}, resource_dir = {:?}", port, resource_dir);

                let sidecar = handle
                    .shell()
                    .sidecar("kwirth-backend")
                    .expect("kwirth-backend sidecar not found")
                    .current_dir(&resource_dir)
                    .env("PORT", port.to_string())
                    .env("AUTH", "kubeconfig")
                    .env("NODE_ENV", "production")
                    .env("ANSILOG", "false")
                    .env("FORCE", "desktop");

                let (mut rx, child) = sidecar.spawn().expect("failed to spawn kwirth-backend");

                // Store child so we can kill it when the app closes
                *handle.state::<BackendChild>().0.lock().unwrap() = Some(child);

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                print!("[back] {}", String::from_utf8_lossy(&line))
                            }
                            CommandEvent::Stderr(line) => {
                                eprint!("[back] {}", String::from_utf8_lossy(&line))
                            }
                            _ => {}
                        }
                    }
                });

                wait_for_backend(port).await;
                println!("Kwirth Desktop: backend ready, opening main window");

                let init_script = r#"
                    window.kwirth = {
                        kubeApiAvailable: function(url) {
                            return window.__TAURI__.core.invoke('kube_api_available', { url: url });
                        },
                        storeGet: function(key) {
                            return window.__TAURI__.core.invoke('store_get', { key: key });
                        },
                        storeSet: function(key, value) {
                            return window.__TAURI__.core.invoke('store_set', { key: key, value: value });
                        }
                    };
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'F12') {
                            window.__TAURI__.core.invoke('open_devtools');
                        }
                    });
                "#;

                let main_win = WebviewWindowBuilder::new(
                    &handle,
                    "main",
                    WebviewUrl::External(
                        format!("http://localhost:{}/front/", port)
                            .parse()
                            .expect("invalid backend URL"),
                    ),
                )
                .title("Kwirth Magnify")
                .inner_size(1200.0, 800.0)
                .initialization_script(init_script)
                .visible(false)
                .build()
                .expect("failed to create main window");

                tokio::time::sleep(Duration::from_millis(1500)).await;
                let _ = main_win.show();
                let _ = main_win.set_focus();

                if let Some(splash) = handle.get_webview_window("splash") {
                    let _ = splash.close();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                if let Ok(mut lock) = window.app_handle().state::<BackendChild>().0.lock() {
                    if let Some(child) = lock.take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_devtools,
            kube_api_available,
            store_get,
            store_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
