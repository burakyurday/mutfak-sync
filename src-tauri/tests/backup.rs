use anyhow::Result;
use mutfak_sync::{
    cloud::{CloudProvider, MockCloudProvider, RemoteFile},
    database::{Database, Settings},
    engine::Engine,
    security,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tempfile::TempDir;
struct Fixture {
    _tmp: TempDir,
    root: PathBuf,
    remote: PathBuf,
    db: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("Mutfak Ajans");
        let remote = t.path().join("Drive");
        let db = t.path().join("state.sqlite");
        fs::create_dir_all(&root).unwrap();
        Self {
            _tmp: t,
            root,
            remote,
            db,
        }
    }
    fn engine(&self, user: &str) -> Engine<MockCloudProvider> {
        let s = Settings {
            user: user.into(),
            root: self.root.to_string_lossy().into(),
            stability_secs: 0,
            ..Settings::default()
        };
        Engine::new(
            Database::open(&self.db).unwrap(),
            MockCloudProvider::new(self.remote.join(format!("{user} PC"))).unwrap(),
            s,
        )
        .unwrap()
    }
    fn write(&self, path: &str, data: &[u8]) {
        let p = self.root.join(path);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, data).unwrap();
    }
}
fn drain<P: CloudProvider>(e: &mut Engine<P>) {
    for _ in 0..100 {
        if !e.tick().unwrap() {
            return;
        }
    }
    panic!("queue did not drain")
}
#[test]
fn burak_routes_to_burak_pc() {
    let f = Fixture::new();
    f.write("Yeni.psd", b"psd");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert_eq!(
        fs::read(f.remote.join("Burak PC/Yeni.psd")).unwrap(),
        b"psd"
    );
    assert!(!f.remote.join("Naz PC").exists());
}
#[test]
fn naz_routes_to_naz_pc() {
    let f = Fixture::new();
    f.write("Yeni.ai", b"ai");
    let mut e = f.engine("Naz");
    e.scan().unwrap();
    drain(&mut e);
    assert_eq!(fs::read(f.remote.join("Naz PC/Yeni.ai")).unwrap(), b"ai");
}
#[test]
fn users_do_not_collide() {
    let a = Fixture::new();
    let b = Fixture::new();
    a.write("same.psd", b"Burak");
    b.write("same.psd", b"Naz");
    let mut ea = a.engine("Burak");
    let mut eb = b.engine("Naz");
    eb.cloud = MockCloudProvider::new(a.remote.join("Naz PC")).unwrap();
    ea.scan().unwrap();
    eb.scan().unwrap();
    drain(&mut ea);
    drain(&mut eb);
    assert_eq!(
        fs::read(a.remote.join("Burak PC/same.psd")).unwrap(),
        b"Burak"
    );
    assert_eq!(fs::read(a.remote.join("Naz PC/same.psd")).unwrap(), b"Naz");
}
#[test]
fn nested_unicode_and_empty_directories() {
    let f = Fixture::new();
    f.write("Müşteriler/Flexi/PSD/Kasım Story 🧿.psd", b"design");
    fs::create_dir_all(f.root.join("Boş Klasör/İç İçe")).unwrap();
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert!(f
        .remote
        .join("Burak PC/Müşteriler/Flexi/PSD/Kasım Story 🧿.psd")
        .is_file());
    assert!(f.remote.join("Burak PC/Boş Klasör/İç İçe").is_dir());
    assert!(!f.remote.join("Burak PC/Mutfak Ajans").exists());
}
#[test]
fn modified_psd_updates_same_identity() {
    let f = Fixture::new();
    f.write("a.psd", b"before");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    let id = e.db.entries().unwrap()[0].remote_id.clone();
    f.write("a.psd", b"after design");
    e.scan().unwrap();
    drain(&mut e);
    assert_eq!(e.db.entries().unwrap()[0].remote_id, id);
    assert_eq!(
        fs::read(f.remote.join("Burak PC/a.psd")).unwrap(),
        b"after design"
    );
}
#[test]
fn unchanged_file_not_uploaded_twice() {
    let f = Fixture::new();
    f.write("a.psd", b"same");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    let uploads = e.cloud.uploads;
    e.scan().unwrap();
    drain(&mut e);
    assert_eq!(e.cloud.uploads, uploads);
}
#[test]
fn offline_queue_survives_restart() {
    let f = Fixture::new();
    f.write("a.psd", b"same");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    e.cloud.offline = true;
    assert!(e.tick().unwrap());
    assert_eq!(e.db.entries().unwrap()[0].status, "error");
    drop(e);
    let mut e = f.engine("Burak");
    assert_eq!(e.db.entries().unwrap()[0].status, "error");
    e.db.conn
        .execute("UPDATE upload_queue SET available=0", [])
        .unwrap();
    drain(&mut e);
    assert_eq!(e.db.entries().unwrap()[0].status, "backed_up");
}
#[test]
fn discovers_changes_made_while_closed() {
    let f = Fixture::new();
    drop(f.engine("Burak"));
    f.write("offline.psd", b"offline");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert!(f.remote.join("Burak PC/offline.psd").exists());
}
#[test]
fn local_delete_preserves_cloud() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    fs::remove_file(f.root.join("a")).unwrap();
    e.scan().unwrap();
    assert!(f.remote.join("Burak PC/a").is_file());
    assert_eq!(e.db.entries().unwrap()[0].status, "local_missing");
}
#[test]
fn cloud_delete_preserves_and_rebacks_local() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    fs::remove_file(f.remote.join("Burak PC/a")).unwrap();
    e.scan().unwrap();
    assert!(f.root.join("a").exists());
    drain(&mut e);
    assert!(f.remote.join("Burak PC/a").exists());
}
#[test]
fn pending_file_cannot_archive() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    assert!(e.archive_plan("a").is_err());
}
#[test]
fn stale_checksum_cannot_archive() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    f.write("a", b"new content");
    assert!(e.archive_plan("a").is_err());
    assert!(f.root.join("a").exists());
}
#[test]
fn restore_to_original_path_without_overwrite() {
    let f = Fixture::new();
    f.write("nested/a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert!(e.restore("nested/a").is_err());
    fs::remove_file(f.root.join("nested/a")).unwrap();
    e.db.conn
        .execute(
            "UPDATE file_manifest SET status='cloud_only' WHERE path='nested/a'",
            [],
        )
        .unwrap();
    e.restore("nested/a").unwrap();
    assert_eq!(fs::read(f.root.join("nested/a")).unwrap(), b"safe");
    assert_eq!(
        e.db.entries()
            .unwrap()
            .into_iter()
            .find(|v| v.path == "nested/a")
            .unwrap()
            .status,
        "backed_up"
    );
}
#[test]
fn permission_revocation_keeps_data_and_queue() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    e.cloud.denied = true;
    e.tick().unwrap();
    assert!(f.root.join("a").exists());
    assert_eq!(e.db.entries().unwrap()[0].status, "error");
    assert_eq!(
        e.db.conn
            .query_row("SELECT COUNT(*) FROM upload_queue", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn pending_queue_persists() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drop(e);
    let mut e = f.engine("Burak");
    drain(&mut e);
    assert_eq!(e.db.entries().unwrap()[0].status, "backed_up");
}
struct MutatingProvider {
    inner: MockCloudProvider,
    mutate: bool,
}
impl CloudProvider for MutatingProvider {
    fn stat(&mut self, p: &str) -> Result<Option<RemoteFile>> {
        self.inner.stat(p)
    }
    fn mkdir(&mut self, p: &str) -> Result<RemoteFile> {
        self.inner.mkdir(p)
    }
    fn upload(&mut self, l: &Path, p: &str) -> Result<RemoteFile> {
        let r = self.inner.upload(l, p)?;
        if self.mutate {
            fs::write(l, b"Photoshop saved again")?;
            self.mutate = false;
        }
        Ok(r)
    }
    fn download(&mut self, p: &str, d: &Path) -> Result<()> {
        self.inner.download(p, d)
    }
    fn claim_device(&mut self, d: &str) -> Result<()> {
        self.inner.claim_device(d)
    }
    fn archive_version(&mut self, p: &str, v: &str) -> Result<()> {
        self.inner.archive_version(p, v)
    }
}
#[test]
fn save_during_upload_eventually_verifies_latest() {
    let f = Fixture::new();
    f.write("a.psd", b"old");
    let e = f.engine("Burak");
    let mut e = Engine::new(
        e.db,
        MutatingProvider {
            inner: e.cloud,
            mutate: true,
        },
        e.settings,
    )
    .unwrap();
    e.scan().unwrap();
    e.tick().unwrap();
    assert_eq!(e.db.entries().unwrap()[0].status, "pending");
    drain(&mut e);
    assert_eq!(e.db.entries().unwrap()[0].status, "backed_up");
    assert_eq!(
        fs::read(f.remote.join("Burak PC/a.psd")).unwrap(),
        b"Photoshop saved again"
    );
}
#[test]
fn duplicate_names_stop_without_data_loss() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    e.cloud.duplicates = true;
    e.tick().unwrap();
    assert_eq!(e.db.entries().unwrap()[0].status, "error");
    assert!(!f.remote.join("Burak PC/a").exists());
    assert!(f.root.join("a").exists());
}
#[test]
fn archive_requires_explicit_confirmation() {
    let f = Fixture::new();
    f.write("a", b"safe");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    let p = e.archive_plan("a").unwrap();
    assert!(e.archive(&p, false).is_err());
    assert!(f.root.join("a").exists());
}
#[test]
fn second_device_same_target_rejected() {
    let f = Fixture::new();
    let e = f.engine("Burak");
    let other = f._tmp.path().join("other.sqlite");
    assert!(Engine::new(
        Database::open(&other).unwrap(),
        MockCloudProvider::new(f.remote.join("Burak PC")).unwrap(),
        e.settings
    )
    .is_err());
}
#[test]
fn versions_preserve_previous_verified_content() {
    let f = Fixture::new();
    f.write("a.psd", b"old");
    let mut e = f.engine("Burak");
    e.settings.versions = true;
    e.scan().unwrap();
    drain(&mut e);
    f.write("a.psd", b"latest");
    e.scan().unwrap();
    drain(&mut e);
    let path: String =
        e.db.conn
            .query_row("SELECT remote_path FROM file_versions", [], |r| r.get(0))
            .unwrap();
    assert_eq!(
        fs::read(f.remote.join("Burak PC").join(path)).unwrap(),
        b"old"
    );
}
#[test]
fn traversal_and_default_filters() {
    let f = Fixture::new();
    for p in ["../secret", "/etc/passwd", "C:/secret", "a/../../b", "x\\y"] {
        assert!(security::safe_path(&f.root, p).is_err(), "{p}");
    }
    assert!(security::excluded(".DS_Store", false));
    assert!(!security::excluded("Design.psd", false));
    assert!(!security::excluded("PSD/cache-design.psd", false));
}
#[cfg(unix)]
#[test]
fn symlink_never_followed() {
    let f = Fixture::new();
    let outside = f._tmp.path().join("secret");
    fs::write(&outside, b"secret").unwrap();
    std::os::unix::fs::symlink(&outside, f.root.join("link")).unwrap();
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert!(e.db.entries().unwrap().is_empty());
    assert!(security::safe_path(&f.root, "link").is_err());
}

#[cfg(target_os = "linux")]
#[test]
fn approved_archive_and_restore_with_isolated_trash() {
    if std::env::var_os("MUTFAK_TRASH_CHILD").is_none() {
        let isolated = tempfile::tempdir().unwrap();
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "approved_archive_and_restore_with_isolated_trash",
                "--nocapture",
            ])
            .env("MUTFAK_TRASH_CHILD", "1")
            .env("XDG_DATA_HOME", isolated.path())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
        return;
    }
    let f = Fixture::new();
    f.write("Proje/Tasarım.psd", b"verified backup");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    let plan = e.archive_plan("Proje/Tasarım.psd").unwrap();
    e.archive(&plan, true).unwrap();
    assert!(!f.root.join("Proje/Tasarım.psd").exists());
    assert!(f.remote.join("Burak PC/Proje/Tasarım.psd").exists());
    assert_eq!(
        e.db.entries()
            .unwrap()
            .into_iter()
            .find(|v| v.path == "Proje/Tasarım.psd")
            .unwrap()
            .status,
        "cloud_only"
    );
    e.restore("Proje/Tasarım.psd").unwrap();
    assert_eq!(
        fs::read(f.root.join("Proje/Tasarım.psd")).unwrap(),
        b"verified backup"
    );
}

#[cfg(windows)]
#[test]
fn locked_windows_file_is_retried() {
    use std::os::windows::fs::OpenOptionsExt;
    let f = Fixture::new();
    f.write("Locked.psd", b"locked");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    let handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(f.root.join("Locked.psd"))
        .unwrap();
    e.tick().unwrap();
    assert_eq!(e.db.entries().unwrap()[0].status, "error");
    drop(handle);
    e.db.conn
        .execute("UPDATE upload_queue SET available=0", [])
        .unwrap();
    drain(&mut e);
    assert_eq!(e.db.entries().unwrap()[0].status, "backed_up");
}

#[test]
fn optional_filter_removes_queued_work_and_can_be_disabled() {
    let f = Fixture::new();
    f.write("node_modules/project.js", b"code");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    e.settings.exclude_dev = true;
    e.scan_local().unwrap();
    drain(&mut e);
    assert!(!f.remote.join("Burak PC/node_modules/project.js").exists());
    assert!(e
        .db
        .entries()
        .unwrap()
        .iter()
        .all(|v| v.status == "excluded"));
    e.settings.exclude_dev = false;
    e.scan().unwrap();
    drain(&mut e);
    assert!(f.remote.join("Burak PC/node_modules/project.js").exists());
}

#[test]
fn reset_delays_wakes_delayed_retry_queue() {
    let f = Fixture::new();
    f.write("Offline.psd", b"content");
    let mut e = f.engine("Burak");
    e.cloud.offline = true;
    e.scan().unwrap();
    e.tick().unwrap();
    let entries = e.db.entries().unwrap();
    assert_eq!(entries[0].status, "error");
    let available: i64 =
        e.db.conn
            .query_row(
                "SELECT available FROM upload_queue WHERE path='Offline.psd'",
                [],
                |r| r.get(0),
            )
            .unwrap();
    assert!(available > 0);
    e.reset_retry_delays().unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let new_available: i64 =
        e.db.conn
            .query_row(
                "SELECT available FROM upload_queue WHERE path='Offline.psd'",
                [],
                |r| r.get(0),
            )
            .unwrap();
    assert!(new_available <= now);
}

#[test]
fn clear_all_resets_database_without_deleting_files() {
    let f = Fixture::new();
    f.write("Preserved.psd", b"preserve this data");
    let mut e = f.engine("Burak");
    e.scan().unwrap();
    drain(&mut e);
    assert!(f.remote.join("Burak PC/Preserved.psd").exists());
    assert!(f.root.join("Preserved.psd").exists());

    e.db.clear_all().unwrap();
    assert!(e.db.settings().unwrap().is_none());
    assert!(e.db.entries().unwrap().is_empty());
    // Local and remote files MUST remain intact
    assert!(f.root.join("Preserved.psd").exists());
    assert!(f.remote.join("Burak PC/Preserved.psd").exists());
}

#[test]
fn restore_version_safely_and_updates_manifest() {
    let f = Fixture::new();
    f.write("Project/Logo.ai", b"version-1-initial");
    let mut e = f.engine("Burak");
    e.settings.versions = true;
    e.scan().unwrap();
    drain(&mut e);

    // Update file
    f.write("Project/Logo.ai", b"version-2-updated");
    e.scan().unwrap();
    drain(&mut e);

    // Verify version is recorded
    let versions = e.list_versions("Project/Logo.ai").unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        versions[0].checksum,
        security::checksum(&f.remote.join("Burak PC").join(&versions[0].remote_path)).unwrap()
    );

    // Attempting to restore while local file exists MUST fail safely
    assert!(e.restore_version("Project/Logo.ai", versions[0].id).is_err());

    // Remove local file to restore older version
    fs::remove_file(f.root.join("Project/Logo.ai")).unwrap();
    e.restore_version("Project/Logo.ai", versions[0].id).unwrap();

    // Verify restored content matches version 1
    assert_eq!(
        fs::read(f.root.join("Project/Logo.ai")).unwrap(),
        b"version-1-initial"
    );

    // Verify manifest is updated with restored version's checksum and size
    let entry = e
        .db
        .entries()
        .unwrap()
        .into_iter()
        .find(|e| e.path == "Project/Logo.ai")
        .unwrap();
    assert_eq!(entry.size, b"version-1-initial".len() as u64);
    assert_eq!(entry.checksum, versions[0].checksum);
    assert_eq!(entry.status, "backed_up");
}

#[test]
fn custom_excludes_and_syncignore_support() {
    let f = Fixture::new();
    f.write(".syncignore", b"*.tmp\nrender_cache/\n# a comment\n");
    f.write("work.psd", b"valid psd");
    f.write("test.TMP", b"temp file");
    f.write("render_cache/frame1.png", b"frame");
    f.write("custom_skip/skip.bin", b"skip");

    let mut e = f.engine("Burak");
    e.settings.custom_excludes = "custom_skip/".into();
    e.scan().unwrap();
    drain(&mut e);

    // Only work.psd should be uploaded to remote
    assert!(f.remote.join("Burak PC/work.psd").exists());
    assert!(!f.remote.join("Burak PC/test.TMP").exists());
    assert!(!f.remote.join("Burak PC/render_cache/frame1.png").exists());
    assert!(!f.remote.join("Burak PC/custom_skip/skip.bin").exists());
    assert!(!f.remote.join("Burak PC/.syncignore").exists());
}

#[test]
fn create_project_folder_creates_standard_scaffolding_and_records_activity() {
    let f = Fixture::new();
    let mut e = f.engine("Burak");
    let paths = e.create_project_folder("Acme_Kurumsal").unwrap();
    assert_eq!(paths.len(), 5);
    assert!(f.root.join("Acme_Kurumsal/01_Ham_Gorseller/.keep").exists());
    assert!(f.root.join("Acme_Kurumsal/02_Tasarim_PSD_AI/.keep").exists());
    assert!(f.root.join("Acme_Kurumsal/03_Baski_Hazir_PDF/.keep").exists());
    assert!(f.root.join("Acme_Kurumsal/04_Musteri_Onizleme_JPG/.keep").exists());
    assert!(f.root.join("Acme_Kurumsal/05_Kurumsal_Kimlik/.keep").exists());

    // Fails on duplicate name safely
    assert!(e.create_project_folder("Acme_Kurumsal").is_err());
    // Fails on invalid traversal characters
    assert!(e.create_project_folder("../escape").is_err());
    assert!(e.create_project_folder("bad/slash").is_err());

    let activity = e.db.activity_log(10).unwrap();
    assert!(activity.iter().any(|a| a.message.contains("Acme_Kurumsal")));

    let quota = e.drive_quota().unwrap();
    assert_eq!(quota.total_bytes, 5 * 1024 * 1024 * 1024 * 1024);
}
