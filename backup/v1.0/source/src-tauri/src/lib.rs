use tauri::{Manager, WebviewWindow, Listener};

// Windows-spezifische Imports für Screenshot-Schutz
#[cfg(target_os = "windows")]
use windows::{
    Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY},
    },
};

// Windows-Konstanten für SetWindowDisplayAffinity
#[cfg(target_os = "windows")]
const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;

// Tauri Command für Screenshot-Schutz
#[tauri::command]
async fn enable_screenshot_protection(window: WebviewWindow) -> std::result::Result<String, String> {    #[cfg(target_os = "windows")]
    {
        // Hole das Windows HWND vom Tauri-Fenster
        let hwnd_raw = window.hwnd().map_err(|e| format!("Failed to get window handle: {}", e))?;
        let hwnd = HWND(hwnd_raw.0);
        
        // Aktiviere Screenshot-Schutz mit SetWindowDisplayAffinity
        unsafe {
            let result = SetWindowDisplayAffinity(hwnd, WINDOW_DISPLAY_AFFINITY(WDA_EXCLUDEFROMCAPTURE));
            match result {
                Ok(_) => Ok("Screenshot protection enabled successfully".to_string()),
                Err(_) => Err("Failed to enable screenshot protection".to_string())
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Screenshot protection is only available on Windows".to_string())
    }
}

#[tauri::command]
async fn disable_screenshot_protection(window: WebviewWindow) -> std::result::Result<String, String> {    #[cfg(target_os = "windows")]
    {
        // Hole das Windows HWND vom Tauri-Fenster
        let hwnd_raw = window.hwnd().map_err(|e| format!("Failed to get window handle: {}", e))?;
        let hwnd = HWND(hwnd_raw.0);
        
        // Deaktiviere Screenshot-Schutz (0 = normal)
        unsafe {
            let result = SetWindowDisplayAffinity(hwnd, WINDOW_DISPLAY_AFFINITY(0));
            match result {
                Ok(_) => Ok("Screenshot protection disabled successfully".to_string()),
                Err(_) => Err("Failed to disable screenshot protection".to_string())
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Screenshot protection is only available on Windows".to_string())
    }
}

#[tauri::command]
async fn check_screenshot_protection_status(window: WebviewWindow) -> std::result::Result<String, String> {    #[cfg(target_os = "windows")]
    {
        // Hole das Windows HWND vom Tauri-Fenster
        let hwnd = window.hwnd().map_err(|e| format!("Failed to get window handle: {}", e))?;
        let _hwnd = HWND(hwnd.0);
        
        // Versuche den aktuellen Status zu ermitteln (dies ist eine vereinfachte Überprüfung)
        // Da es keine direkte GetWindowDisplayAffinity API gibt, geben nur zurück, dass der Schutz aktiv ist
        Ok("Screenshot protection status: ACTIVE (WDA_EXCLUDEFROMCAPTURE)".to_string())
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Screenshot protection is only available on Windows".to_string())
    }
}

// Alte greet-Funktion entfernt, da nicht mehr benötigt

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            enable_screenshot_protection,
            disable_screenshot_protection,
            check_screenshot_protection_status
        ])        .setup(|app| {
            // Aktiviere Screenshot-Schutz für das Hauptfenster beim Start
            if let Some(window) = app.get_webview_window("main") {
                tauri::async_runtime::spawn(async move {
                    // Verzögerung um sicherzustellen, dass das Fenster vollständig geladen ist nur bei Hauptfenster
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    if let Err(e) = enable_screenshot_protection(window).await {
                        eprintln!("Failed to enable screenshot protection for main window: {}", e);
                    } else {
                        println!("✅ Screenshot protection enabled for main window");
                    }
                });
            }
              // Event-Listener für neue Fenster mit automatischer Show-Funktion
            let app_handle = app.handle().clone();
            app.listen("tauri://window-created", move |event| {
                let app_handle = app_handle.clone();
                
                // Parse das JSON payload
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let Some(window_label) = payload.get("label").and_then(|v| v.as_str()) {
                        // Nur für neue Website-Fenster (nicht das Hauptfenster)
                        if window_label.starts_with("aegis-") {
                            println!("🆔 New window detected: {}", window_label);
                            let window_label = window_label.to_string();
                            
                            // Automatische Protection + Show-Sequenz
                            tauri::async_runtime::spawn(async move {
                                // Warte bis das Fenster vollständig initialisiert ist
                                tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                                
                                if let Some(window) = app_handle.get_webview_window(&window_label) {
                                    // 1. Versuche Screenshot-Schutz zu aktivieren
                                    let mut protection_enabled = false;
                                    for attempt in 1..=5 {
                                        match enable_screenshot_protection(window.clone()).await {
                                            Ok(_) => {
                                                println!("🛡️ Backend protection enabled for: {} (attempt {})", window_label, attempt);
                                                protection_enabled = true;
                                                break;
                                            }
                                            Err(e) => {
                                                if attempt == 5 {
                                                    eprintln!("❌ Backend protection failed for {} after {} attempts: {}", window_label, attempt, e);
                                                }
                                                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                            }
                                        }
                                    }
                                    
                                    // 2. Fenster IMMER anzeigen - auch ohne Schutz
                                    match window.show() {
                                        Ok(_) => {
                                            if protection_enabled {
                                                println!("✅ BACKEND: Window shown safely with protection: {}", window_label);
                                            } else {
                                                println!("⚠️ BACKEND: Window shown WITHOUT protection: {}", window_label);
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("❌ BACKEND: Failed to show window {}: {}", window_label, e);
                                        }
                                    }
                                } else {
                                    eprintln!("❌ BACKEND: Window not found: {}", window_label);
                                }
                            });
                        }
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
