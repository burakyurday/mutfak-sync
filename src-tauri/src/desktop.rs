use crate::{
    cloud::{CloudProvider, MockCloudProvider, RcloneProvider},
    database::{Activity, Database, Entry, FileVersion, Settings},
    engine::{ArchivePlan, Engine},
    security,
};
use anyhow::{bail, Context, Result};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, State};

type Core = Engine<Box<dyn CloudProvider>>;
#[derive(Clone)]
pub struct AppState {
    core: Arc<Mutex<Option<Core>>>,
    data: PathBuf,
    dirty: Arc<AtomicBool>,
    scan: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    oauth_running: Arc<AtomicBool>,
    oauth_cancel: Arc<AtomicBool>,
    _lock: Arc<fs::File>,
}
#[derive(Serialize)]
pub struct Snapshot {
    settings: Option<Settings>,
    entries: Vec<Entry>,
    activity: Vec<Activity>,
    paused: bool,
    error: Option<String>,
    free_bytes: u64,
    device: String,
    progress: Option<serde_json::Value>,
}
fn binary() -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let suffix = std::env::consts::EXE_SUFFIX;
    let beside = exe
        .parent()
        .context("Uygulama yolu yok")?
        .join(format!("rclone{suffix}"));
    if beside.is_file() {
        return Ok(beside);
    }
    #[cfg(debug_assertions)]
    {
        let target = if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") {
                "aarch64-apple-darwin"
            } else {
                "x86_64-apple-darwin"
            }
        } else if cfg!(windows) {
            "x86_64-pc-windows-msvc"
        } else {
            "x86_64-unknown-linux-gnu"
        };
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(format!("binaries/rclone-{target}{suffix}"));
        if p.exists() {
            return Ok(p);
        }
    }
    bail!("Paketlenmiş Rclone bulunamadı; sidecar kurulumunu çalıştırın")
}
fn provider(data: &std::path::Path, s: &Settings) -> Result<Box<dyn CloudProvider>> {
    let folder = if s.user == "Burak" {
        "Burak PC"
    } else {
        "Naz PC"
    };
    if s.mock {
        return Ok(Box::new(MockCloudProvider::new(
            data.join("mock-cloud").join(folder),
        )?));
    }
    let id = security::folder_id(&s.folder_id)?;
    if keyring::Entry::new("com.mutfakajans.sync", "drive-root")?.get_password()? != id {
        bail!("Yetkilendirilen klasör ile hedef uyuşmuyor")
    }
    Ok(Box::new(RcloneProvider {
        binary: binary()?,
        config: data.join("rclone.conf"),
        device_folder: folder.into(),
        bandwidth: security::clean_bandwidth(&s.bandwidth),
        work: data.to_owned(),
    }))
}
fn core(data: &std::path::Path, s: Settings) -> Result<Core> {
    let p = provider(data, &s)?;
    Engine::new(Database::open(&data.join("state.sqlite"))?, p, s)
}
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T> + Send + 'static,
) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn default_root(app: tauri::AppHandle) -> std::result::Result<String, String> {
    app.path()
        .home_dir()
        .map(|p| p.join("Mutfak Ajans").to_string_lossy().into())
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn snapshot(state: State<'_, AppState>) -> std::result::Result<Snapshot, String> {
    let s = state.inner().clone();
    blocking(move || {
        // Read through a separate WAL connection so large uploads never block the UI.
        let db = Database {
            conn: rusqlite::Connection::open(s.data.join("state.sqlite"))?,
        };
        let settings = db.settings()?;
        let device = if let Some(ref settings) = settings {
            db.device(&settings.user)?
        } else {
            String::new()
        };
        let free_bytes = fs2::available_space(
            settings
                .as_ref()
                .map(|v| PathBuf::from(&v.root))
                .unwrap_or_else(|| s.data.clone()),
        )
        .unwrap_or(0);
        let progress = fs::read(s.data.join("transfer.json"))
            .ok()
            .and_then(|v| serde_json::from_slice(&v).ok());
        Ok(Snapshot {
            settings,
            entries: db.entries()?,
            activity: db.activity()?,
            paused: s.paused.load(Ordering::Relaxed),
            error: s.last_error.lock().unwrap().clone(),
            free_bytes,
            device,
            progress,
        })
    })
    .await
}
#[tauri::command]
async fn configure(
    settings: Settings,
    state: State<'_, AppState>,
) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move||{
        if !matches!(settings.user.as_str(),"Burak"|"Naz"){bail!("Geçersiz kullanıcı")}
        if settings.stability_secs<30 || settings.scan_secs<60 {bail!("Kararlılık en az 30 sn, tarama en az 60 sn olmalı")}
        if !settings.bandwidth.is_empty() && !settings.bandwidth.chars().all(|c|c.is_ascii_digit()||matches!(c,'.'|'K'|'M'|'G'|'k'|'m'|'g')){bail!("Geçersiz hız sınırı")}
        let path=PathBuf::from(&settings.root);
        if !path.is_absolute(){bail!("Mutlak klasör yolu gerekli")}
        fs::create_dir_all(&path)?;
        let canonical=path.canonicalize()?;
        if canonical.starts_with(&s.data)||s.data.starts_with(&canonical){bail!("Çalışma klasörü uygulama verileriyle çakışıyor")}
        if security::is_link(&fs::symlink_metadata(&path)?){bail!("Bağlantılı kök klasör desteklenmiyor")}
        let mut guard=s.core.lock().unwrap();
        if let Some(c)=guard.as_ref(){
            if c.settings.user!=settings.user || c.settings.root!=settings.root || c.settings.mock!=settings.mock || c.settings.folder_id!=settings.folder_id{bail!("Hedef, profil ve kök değişiklikleri bu sürümde engellidir. Ayrı bir işletim sistemi profili kullanın.")}
        }
        let mut c=core(&s.data,settings.clone())?;c.db.save_settings(&settings)?;c.scan()?;
        *guard=Some(c);*s.last_error.lock().unwrap()=None;s.scan.store(true,Ordering::Relaxed);Ok(())
    }).await
}
#[tauri::command]
async fn backup_now(state: State<'_, AppState>) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        if let Some(ref mut c) = *s.core.lock().unwrap() {
            let _ = c.reset_retry_delays();
        }
        s.scan.store(true, Ordering::Relaxed);
        Ok(())
    })
    .await
}
#[tauri::command]
async fn disconnect_account(state: State<'_, AppState>) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        let mut guard = s.core.lock().unwrap();
        *guard = None;
        drop(guard);

        #[cfg(feature = "desktop")]
        {
            security::delete_rclone_config();
            if let Ok(entry) = keyring::Entry::new("com.mutfakajans.sync", "drive-root") {
                let _ = entry.delete_credential();
            }
        }

        let db = Database::open(&s.data.join("state.sqlite"))?;
        db.clear_all()?;
        db.log("Google Drive ve hesap bağlantısı kullanıcı tarafından sıfırlandı.")?;

        *s.last_error.lock().unwrap() = None;
        s.scan.store(false, Ordering::Relaxed);
        s.dirty.store(true, Ordering::Relaxed);
        Ok(())
    })
    .await
}
#[tauri::command]
async fn pause(state: State<'_, AppState>) -> std::result::Result<(), String> {
    state.paused.fetch_xor(true, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
async fn prepare_update(state: State<'_, AppState>) -> std::result::Result<bool, String> {
    let s = state.inner().clone();
    blocking(move || {
        // Waiting for the engine lock lets an in-flight provider operation finish first.
        let guard = s.core.lock().unwrap();
        if guard.as_ref().is_some_and(|core| {
            core.db
                .entries()
                .unwrap_or_default()
                .iter()
                .any(|entry| entry.status == "uploading")
        }) {
            bail!("Aktif yükleme tamamlanmadan güncelleme kurulamaz")
        }
        Ok(s.paused.swap(true, Ordering::SeqCst))
    })
    .await
}
#[tauri::command]
async fn resume_after_failed_update(state: State<'_, AppState>) -> std::result::Result<(), String> {
    state.paused.store(false, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
async fn archive_plan(
    path: String,
    state: State<'_, AppState>,
) -> std::result::Result<ArchivePlan, String> {
    let s = state.inner().clone();
    blocking(move || {
        s.core
            .lock()
            .unwrap()
            .as_mut()
            .context("Kurulum gerekli")?
            .archive_plan(&path)
    })
    .await
}
#[tauri::command]
async fn archive_file(
    plan: ArchivePlanInput,
    confirmed: bool,
    state: State<'_, AppState>,
) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        let plan = ArchivePlan {
            path: plan.path,
            size: plan.size,
            checksum: plan.checksum,
            remote_id: plan.remote_id,
            warning: plan.warning,
        };
        s.core
            .lock()
            .unwrap()
            .as_mut()
            .context("Kurulum gerekli")?
            .archive(&plan, confirmed)
    })
    .await
}
#[derive(serde::Deserialize)]
pub struct ArchivePlanInput {
    pub path: String,
    pub size: u64,
    pub checksum: String,
    pub remote_id: String,
    pub warning: String,
}
#[tauri::command]
async fn restore(path: String, state: State<'_, AppState>) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        s.core
            .lock()
            .unwrap()
            .as_mut()
            .context("Kurulum gerekli")?
            .restore(&path)
    })
    .await
}
#[tauri::command]
async fn file_versions(
    path: String,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<FileVersion>, String> {
    let s = state.inner().clone();
    blocking(move || {
        security::relative(&path)?;
        s.core
            .lock()
            .unwrap()
            .as_ref()
            .context("Kurulum gerekli")?
            .list_versions(&path)
    })
    .await
}
#[tauri::command]
async fn restore_version(
    path: String,
    version_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        security::relative(&path)?;
        s.core
            .lock()
            .unwrap()
            .as_mut()
            .context("Kurulum gerekli")?
            .restore_version(&path, version_id)
    })
    .await
}
#[tauri::command]
async fn prioritize(path: String, state: State<'_, AppState>) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        security::relative(&path)?;
        s.core
            .lock()
            .unwrap()
            .as_mut()
            .context("Kurulum gerekli")?
            .prioritize(&path)
    })
    .await
}
#[tauri::command]
async fn connect_drive(
    folder: String,
    state: State<'_, AppState>,
) -> std::result::Result<(), String> {
    let s = state.inner().clone();
    blocking(move || {
        if s.oauth_running.swap(true, Ordering::SeqCst) {
            bail!("Bir Google bağlantı işlemi zaten sürüyor")
        }
        struct Reset(Arc<AtomicBool>);
        impl Drop for Reset {
            fn drop(&mut self) {
                self.0.store(false, Ordering::SeqCst);
            }
        }
        let _reset = Reset(s.oauth_running.clone());
        s.oauth_cancel.store(false, Ordering::Relaxed);
        if let Some(c) = s.core.lock().unwrap().as_ref() {
            if c.settings.mock {
                bail!("Mock profilini gerçek Drive profiline dönüştürme bu sürümde desteklenmiyor")
            }
            if security::folder_id(&c.settings.folder_id)? != security::folder_id(&folder)? {
                bail!("Yeniden bağlantı mevcut hedef klasörü kullanmalı")
            }
        }
        let id = security::folder_id(&folder)?;
        let config = s.data.join(format!("oauth-{}.conf", uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            let file = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&config)?;
            security::private_file(&config)?;
            drop(file);
            let mut command = std::process::Command::new(binary()?);
            security::hide_windows_console(&mut command);
            let mut child = command
                .args([
                    "config",
                    "create",
                    "mutfak",
                    "drive",
                    "scope",
                    "drive",
                    "root_folder_id",
                    &id,
                    "config_is_local",
                    "true",
                ])
                .arg("--config")
                .arg(&config)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()?;
            let started = Instant::now();
            let status = loop {
                if s.oauth_cancel.load(Ordering::Relaxed)
                    || started.elapsed() > Duration::from_secs(300)
                {
                    let _ = child.kill();
                    let _ = child.wait();
                    bail!("Google bağlantısı iptal edildi veya zaman aşımına uğradı")
                }
                if let Some(status) = child.try_wait()? {
                    break status;
                }
                std::thread::sleep(Duration::from_millis(250));
            };
            if !status.success() {
                bail!("Google bağlantısı tamamlanamadı veya iptal edildi")
            }
            let text = fs::read_to_string(&config)?;
            if !text.contains("token =") {
                bail!("OAuth token alınamadı")
            }
            security::save_rclone_config(&text)?;
            keyring::Entry::new("com.mutfakajans.sync", "drive-root")?.set_password(&id)?;
            Ok(())
        })();
        let _ = fs::remove_file(config);
        result
    })
    .await
}
#[tauri::command]
fn cancel_drive(state: State<'_, AppState>) {
    state.oauth_cancel.store(true, Ordering::Relaxed);
}
#[tauri::command]
async fn diagnostics(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let s = state.inner().clone();
    blocking(move||{
    let g=s.core.lock().unwrap();let report=serde_json::json!({"app":"Mutfak Sync","version":env!("CARGO_PKG_VERSION"),"os":std::env::consts::OS,"configured":g.is_some(),"mode":g.as_ref().map(|c|if c.settings.mock{"mock"}else{"drive"}),"queued":g.as_ref().map(|c|c.db.entries().unwrap_or_default().iter().filter(|e|e.status=="pending"||e.status=="error").count())});
    let path=s.data.join("diagnostics.json");fs::write(&path,serde_json::to_vec_pretty(&report)?)?;Ok(path.to_string_lossy().into())
}).await
}
#[tauri::command]
fn open_location(
    kind: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> std::result::Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let g = state.core.lock().unwrap();
    let c = g.as_ref().ok_or("Kurulum gerekli")?;
    match kind.as_str() {
        "local" => app
            .opener()
            .open_path(&c.settings.root, None::<&str>)
            .map_err(|e| e.to_string()),
        "drive" if !c.settings.mock => app
            .opener()
            .open_url(
                format!(
                    "https://drive.google.com/drive/folders/{}",
                    security::folder_id(&c.settings.folder_id).map_err(|e| e.to_string())?
                ),
                None::<&str>,
            )
            .map_err(|e| e.to_string()),
        _ => Err("Geçersiz konum".into()),
    }
}
fn background(s: AppState, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last = Instant::now() - Duration::from_secs(601);
        let mut watcher: Option<RecommendedWatcher> = None;
        let mut watched = String::new();
        let mut dirty_since: Option<Instant> = None;
        let mut reconnect = Instant::now();
        loop {
            if let Ok(mut g) = s.core.lock() {
                if g.is_none() && reconnect.elapsed() >= Duration::from_secs(30) {
                    reconnect = Instant::now();
                    let retry = (|| -> Result<Option<Core>> {
                        let db = Database::open(&s.data.join("state.sqlite"))?;
                        db.settings()?
                            .map(|settings| core(&s.data, settings))
                            .transpose()
                    })();
                    match retry {
                        Ok(Some(c)) => {
                            *g = Some(c);
                            s.scan.store(true, Ordering::Relaxed);
                            *s.last_error.lock().unwrap() = None;
                        }
                        Err(e) => *s.last_error.lock().unwrap() = Some(e.to_string()),
                        _ => {}
                    }
                }
                if let Some(c) = g.as_mut() {
                    if watched != c.settings.root {
                        let dirty = s.dirty.clone();
                        match notify::recommended_watcher(
                            move |_: notify::Result<notify::Event>| {
                                dirty.store(true, Ordering::Relaxed);
                            },
                        ) {
                            Ok(mut w) => {
                                if w.watch(
                                    std::path::Path::new(&c.settings.root),
                                    RecursiveMode::Recursive,
                                )
                                .is_ok()
                                {
                                    watcher = Some(w);
                                    watched = c.settings.root.clone();
                                } else {
                                    *s.last_error.lock().unwrap() = Some(
                                        "Dosya izleyici başlatılamadı; periyodik tarama etkin"
                                            .into(),
                                    )
                                }
                            }
                            Err(_) => {
                                *s.last_error.lock().unwrap() = Some(
                                    "Dosya izleyici kullanılamıyor; periyodik tarama etkin".into(),
                                )
                            }
                        }
                    }
                    if s.dirty.swap(false, Ordering::Relaxed) {
                        dirty_since = Some(Instant::now());
                    }
                    let audit = s.scan.swap(false, Ordering::Relaxed)
                        || last.elapsed() >= Duration::from_secs(c.settings.scan_secs);
                    if audit || dirty_since.is_some_and(|t| t.elapsed() >= Duration::from_secs(2)) {
                        let result = if audit { c.scan() } else { c.scan_local() };
                        match result {
                            Ok(()) => *s.last_error.lock().unwrap() = None,
                            Err(e) => *s.last_error.lock().unwrap() = Some(e.to_string()),
                        }
                        if audit {
                            last = Instant::now();
                        }
                        dirty_since = None;
                    }
                    c.paused = s.paused.load(Ordering::Relaxed);
                    if let Err(e) = c.tick() {
                        *s.last_error.lock().unwrap() = Some(e.to_string());
                    }
                    if let Some(tray) = app.tray_by_id("main") {
                        let tooltip = if c.paused {
                            "Mutfak Sync · Duraklatıldı"
                        } else if s.last_error.lock().unwrap().is_some() {
                            "Mutfak Sync · Kontrol gerekiyor"
                        } else {
                            let is_uploading =
                                c.db.entries()
                                    .map(|entries| entries.iter().any(|e| e.status == "uploading"))
                                    .unwrap_or(false);
                            if is_uploading {
                                "Mutfak Sync · Dosyalar yedekleniyor..."
                            } else {
                                "Mutfak Sync · Dosyaların güvende"
                            }
                        };
                        let _ = tray.set_tooltip(Some(tooltip));
                    }
                }
            }
            let _ = &watcher;
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    if let Some(public_key) = option_env!("TAURI_SIGNING_PUBLIC_KEY").filter(|key| !key.is_empty())
    {
        builder = builder.plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(public_key)
                .build(),
        );
    }
    builder
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(&data)?;
            let lock = fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(data.join("instance.lock"))?;
            fs2::FileExt::try_lock_exclusive(&lock).context("Mutfak Sync zaten çalışıyor")?;
            for entry in fs::read_dir(&data)? {
                let entry = entry?;
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if let Some(id) = name
                    .strip_prefix("session-")
                    .or_else(|| name.strip_prefix("oauth-"))
                    .and_then(|v| v.strip_suffix(".conf"))
                {
                    if uuid::Uuid::parse_str(id).is_ok() {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            let db = Database::open(&data.join("state.sqlite"))?;
            let saved = db.settings()?;
            drop(db);
            let first_run = saved.is_none();
            let mut error = None;
            let current = if let Some(s) = saved {
                match core(&data, s) {
                    Ok(c) => Some(c),
                    Err(e) => {
                        error = Some(e.to_string());
                        None
                    }
                }
            } else {
                None
            };
            let show_on_start = first_run || error.is_some();
            let s = AppState {
                core: Arc::new(Mutex::new(current)),
                data,
                dirty: Arc::new(AtomicBool::new(true)),
                scan: Arc::new(AtomicBool::new(true)),
                paused: Arc::new(AtomicBool::new(false)),
                last_error: Arc::new(Mutex::new(error)),
                oauth_running: Arc::new(AtomicBool::new(false)),
                oauth_cancel: Arc::new(AtomicBool::new(false)),
                _lock: Arc::new(lock),
            };
            app.manage(s.clone());
            background(s, app.handle().clone());
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
            };
            let items = [
                ("open", "Mutfak Sync'i Aç"),
                ("status", "Son Yedekleme Durumu"),
                ("scan", "Şimdi Yedekle"),
                ("pause", "Duraklat / Devam Et"),
                ("local", "Mutfak Ajans Klasörünü Aç"),
                ("drive", "Google Drive'da Aç"),
                ("hub", "Mutfak Hub Portalını Aç"),
                ("settings", "Ayarlar"),
                ("quit", "Çıkış"),
            ]
            .map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>))
            .into_iter()
            .collect::<std::result::Result<Vec<_>, _>>()?;
            let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items
                .iter()
                .map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
                .collect();
            let menu = Menu::with_items(app, &refs)?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Mutfak Sync · Hazır")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let state = app.state::<AppState>();
                    if event.id().as_ref() == "settings" {
                        let _ = app.emit("navigate", "settings");
                    }
                    if event.id().as_ref() == "hub" {
                        let _ = app.emit("navigate", "hub");
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "scan" => state.scan.store(true, Ordering::Relaxed),
                        "pause" => {
                            state.paused.fetch_xor(true, Ordering::Relaxed);
                        }
                        "local" | "drive" => {
                            let _ = open_location(event.id().as_ref().into(), state, app.clone());
                        }
                        _ => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            // Daily use stays unobtrusive in the tray. Onboarding and startup errors remain visible.
            if show_on_start {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                }
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            default_root,
            configure,
            backup_now,
            pause,
            prepare_update,
            resume_after_failed_update,
            archive_plan,
            archive_file,
            restore,
            file_versions,
            restore_version,
            prioritize,
            connect_drive,
            cancel_drive,
            diagnostics,
            open_location,
            disconnect_account
        ])
        .run(tauri::generate_context!())
        .expect("Mutfak Sync başlatılamadı");
}
