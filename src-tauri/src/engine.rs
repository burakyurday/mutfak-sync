use crate::{
    cloud::CloudProvider,
    database::{now, Database, DriveQuota, Entry, FileVersion, Settings},
    security::{checksum, excluded, is_excluded, is_link, safe_path},
};
use anyhow::{bail, Context, Result};
use rusqlite::params;
use serde::Serialize;
use std::{
    fs,
    path::Path,
    time::{Duration, UNIX_EPOCH},
};
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct ArchivePlan {
    pub path: String,
    pub size: u64,
    pub checksum: String,
    pub remote_id: String,
    pub warning: String,
}
pub struct Engine<P: CloudProvider> {
    pub db: Database,
    pub cloud: P,
    pub settings: Settings,
    pub device: String,
    pub paused: bool,
}
impl<P: CloudProvider> Engine<P> {
    pub fn new(db: Database, mut cloud: P, settings: Settings) -> Result<Self> {
        let device = db.device(&settings.user)?;
        cloud.claim_device(&device)?;
        Ok(Self {
            db,
            cloud,
            settings,
            device,
            paused: false,
        })
    }
    pub fn scan(&mut self) -> Result<()> {
        self.scan_impl(true)
    }
    pub fn scan_local(&mut self) -> Result<()> {
        self.scan_impl(false)
    }
    fn scan_impl(&mut self, audit: bool) -> Result<()> {
        let root = Path::new(&self.settings.root).canonicalize()?;
        let previous = self.db.entries()?;
        let by_path: std::collections::HashMap<&str, &Entry> =
            previous.iter().map(|e| (e.path.as_str(), e)).collect();
        let mut custom_excludes = self.settings.custom_excludes.clone();
        if let Ok(ignore) = fs::read_to_string(root.join(".syncignore")) {
            if !custom_excludes.is_empty() {
                custom_excludes.push('\n');
            }
            custom_excludes.push_str(&ignore);
        }
        let mut cloud_error = None;
        for item in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.path() == root
                    || (e.metadata().map(|m| !is_link(&m)).unwrap_or(false)
                        && !is_excluded(
                            &e.path()
                                .strip_prefix(&root)
                                .unwrap_or(e.path())
                                .to_string_lossy()
                                .replace('\\', "/"),
                            self.settings.exclude_dev,
                            &custom_excludes,
                        ))
            })
        {
            let item = item?;
            if item.path() == root {
                continue;
            }
            let rel = item
                .path()
                .strip_prefix(&root)?
                .to_str()
                .context("Unicode olmayan dosya adı")?
                .replace('\\', "/");
            let meta = fs::symlink_metadata(item.path())?;
            if is_link(&meta) || (!meta.is_file() && !meta.is_dir()) {
                continue;
            }
            let kind = if meta.is_dir() { "directory" } else { "file" };
            let size = if meta.is_file() { meta.len() } else { 0 };
            let modified = stamp(&meta)?;
            let old = by_path.get(rel.as_str()).copied();
            let unchanged =
                old.is_some_and(|e| e.size == size && e.modified == modified && e.kind == kind);
            let mut remote_missing = false;
            if unchanged {
                let old = old.unwrap();
                if old.status == "backed_up" {
                    if !audit {
                        continue;
                    }
                    match self.cloud.stat(&rel) {
                        Ok(Some(remote))
                            if remote.id == old.remote_id.clone().unwrap_or_default()
                                && (kind == "directory"
                                    || remote.checksum == old.checksum && remote.size == size) =>
                        {
                            continue
                        }
                        Ok(_) => remote_missing = true,
                        Err(error) => {
                            cloud_error = Some(error.to_string());
                            self.db
                                .log("Bulut denetimi yapılamadı; yerel dosyalar korundu")?;
                            continue;
                        }
                    }
                } else if old.status != "cloud_only" && old.status != "excluded" {
                    continue;
                }
            }
            let tx = self.db.conn.transaction()?;
            tx.execute("INSERT INTO file_manifest(device_id,path,kind,size,modified,status) VALUES(?1,?2,?3,?4,?5,'pending') ON CONFLICT(path) DO UPDATE SET kind=excluded.kind,size=excluded.size,modified=excluded.modified,status='pending',error=NULL",params![self.device,rel,kind,size as i64,modified])?;
            tx.execute("INSERT INTO upload_queue(path,available) VALUES(?1,?2) ON CONFLICT(path) DO UPDATE SET available=excluded.available,attempts=0",params![rel,now()+if kind=="file"{self.settings.stability_secs as i64}else{0}])?;
            tx.commit()?;
            if remote_missing {
                self.db.log(&format!(
                    "{rel}: uzak kopya eksik veya farklı; yeniden kuyruğa alındı"
                ))?;
            }
        }
        // Local deletion never invokes a cloud mutation.
        for old in previous {
            if is_excluded(&old.path, self.settings.exclude_dev, &custom_excludes) {
                self.db.conn.execute(
                    "UPDATE file_manifest SET status='excluded' WHERE path=?1",
                    [&old.path],
                )?;
                self.db
                    .conn
                    .execute("DELETE FROM upload_queue WHERE path=?1", [&old.path])?;
                continue;
            }
            if old.status != "cloud_only" && !safe_path(&root, &old.path)?.exists() {
                self.db.conn.execute(
                    "UPDATE file_manifest SET status='local_missing' WHERE path=?1",
                    [&old.path],
                )?;
                self.db
                    .conn
                    .execute("DELETE FROM upload_queue WHERE path=?1", [&old.path])?;
            }
        }
        if let Some(error) = cloud_error {
            bail!("Bulut denetimi tamamlanamadı: {error}")
        }
        Ok(())
    }
    pub fn tick(&mut self) -> Result<bool> {
        if self.paused {
            return Ok(false);
        }
        let next = {
            let mut st = self.db.conn.prepare(
                "SELECT path FROM upload_queue WHERE available<=?1 ORDER BY available,path LIMIT 1",
            )?;
            let v = st
                .query_map([now()], |r| r.get::<_, String>(0))?
                .next()
                .transpose()?;
            v
        };
        let Some(path) = next else { return Ok(false) };
        let entry = self
            .db
            .entries()?
            .into_iter()
            .find(|e| e.path == path)
            .context("Manifest yok")?;
        match self.transfer(&entry) {
            Ok(()) => {}
            Err(e) => {
                let error = e.to_string();
                let is_locked = error.contains("LOCKED")
                    || error.contains("os error 32")
                    || error.contains("being used by another process");
                let is_network = error.contains("NETWORK") || error.contains("OFFLINE");
                let attempts = if is_locked {
                    entry.retry
                } else {
                    entry.retry.saturating_add(1)
                };
                let delay = if is_locked {
                    self.settings.stability_secs as i64
                } else if is_network {
                    (10i64.saturating_mul(2i64.pow(attempts.min(6)))).min(900)
                        + rand::random_range(0..5)
                } else {
                    (5i64.saturating_mul(2i64.pow(attempts.min(10)))).min(3600)
                        + rand::random_range(0..5)
                };
                let tx = self.db.conn.transaction()?;
                tx.execute(
                    "UPDATE file_manifest SET status='error',retry=?2,error=?3 WHERE path=?1",
                    params![path, attempts, error],
                )?;
                tx.execute(
                    "UPDATE upload_queue SET available=?2,attempts=?3 WHERE path=?1",
                    params![path, now() + delay, attempts],
                )?;
                tx.commit()?;
                self.db.log(&format!("{path}: {error}"))?;
            }
        }
        Ok(true)
    }
    fn transfer(&mut self, e: &Entry) -> Result<()> {
        let local = safe_path(Path::new(&self.settings.root), &e.path)?;
        let before = match fs::metadata(&local) {
            Ok(m) => m,
            Err(err) => {
                #[cfg(windows)]
                if err.raw_os_error() == Some(32) {
                    bail!("LOCKED: Dosya başka bir uygulama (Photoshop vb.) tarafından kullanımda veya kaydediliyor");
                }
                return Err(err.into());
            }
        };
        if e.kind == "file" && (before.len() != e.size || stamp(&before)? != e.modified) {
            self.requeue(&e.path)?;
            return Ok(());
        }
        self.db.conn.execute(
            "UPDATE file_manifest SET status='uploading' WHERE path=?1",
            [&e.path],
        )?;
        let hash = if e.kind == "file" {
            checksum(&local)?
        } else {
            String::new()
        };
        let existing = self.cloud.stat(&e.path)?;
        if let (Some(expected), Some(actual)) = (&e.remote_id, &existing) {
            if *expected != actual.id {
                bail!("AMBIGUOUS: Uzak dosya kimliği değişti; inceleme gerekiyor")
            }
        }
        if self.settings.versions && e.kind == "file" {
            if let Some(old) = &existing {
                if old.checksum != hash && !e.checksum.is_empty() && old.checksum == e.checksum {
                    let version = format!(
                        ".mutfak-versions/{}/{}-{}",
                        e.path,
                        now(),
                        uuid::Uuid::new_v4()
                    );
                    self.cloud.archive_version(&e.path, &version)?;
                    self.db.conn.execute("INSERT INTO file_versions(path,remote_path,checksum,created) VALUES(?1,?2,?3,?4)",params![e.path,version,e.checksum,now()])?;
                }
            }
        }
        let remote = if e.kind == "directory" {
            self.cloud.mkdir(&e.path)?
        } else if let Some(f) = existing.filter(|f| f.checksum == hash && f.size == e.size) {
            f
        } else {
            self.cloud.upload(&local, &e.path)?
        };
        if e.kind == "file" {
            let after = match fs::metadata(&local) {
                Ok(m) => m,
                Err(err) => {
                    #[cfg(windows)]
                    if err.raw_os_error() == Some(32) {
                        bail!("LOCKED: Dosya başka bir uygulama (Photoshop vb.) tarafından kullanımda veya kaydediliyor");
                    }
                    return Err(err.into());
                }
            };
            if stamp(&before)? != stamp(&after)?
                || before.len() != after.len()
                || checksum(&local)? != hash
            {
                self.requeue(&e.path)?;
                return Ok(());
            }
            if remote.size != after.len() || remote.checksum.is_empty() || remote.checksum != hash {
                bail!("Yükleme checksum doğrulaması başarısız")
            }
        }
        let tx = self.db.conn.transaction()?;
        tx.execute("UPDATE file_manifest SET status='backed_up',checksum=?2,remote_id=?3,parent_id=?4,last_success=?5,retry=0,error=NULL WHERE path=?1",params![e.path,hash,remote.id,remote.parent_id,now()])?;
        tx.execute("DELETE FROM upload_queue WHERE path=?1", [&e.path])?;
        tx.commit()?;
        self.db.log(&format!("{} yedeklendi", e.path))?;
        Ok(())
    }
    pub fn reset_retry_delays(&mut self) -> Result<()> {
        self.db.reset_retry_delays()
    }
    fn requeue(&mut self, path: &str) -> Result<()> {
        let p = safe_path(Path::new(&self.settings.root), path)?;
        let m = fs::metadata(p)?;
        self.db.conn.execute(
            "UPDATE file_manifest SET size=?2,modified=?3,status='pending' WHERE path=?1",
            params![path, m.len() as i64, stamp(&m)?],
        )?;
        self.db.conn.execute(
            "UPDATE upload_queue SET available=?2 WHERE path=?1",
            params![path, now() + self.settings.stability_secs as i64],
        )?;
        Ok(())
    }
    pub fn archive_plan(&mut self, path: &str) -> Result<ArchivePlan> {
        let e = self
            .db
            .entries()?
            .into_iter()
            .find(|e| e.path == path)
            .context("Dosya kayıtlı değil")?;
        if e.status != "backed_up" || e.kind != "file" {
            bail!("Yalnızca doğrulanmış yedekler arşivlenebilir")
        }
        let pending: i64 = self.db.conn.query_row(
            "SELECT COUNT(*) FROM upload_queue WHERE path=?1",
            [path],
            |r| r.get(0),
        )?;
        if pending != 0 {
            bail!("Dosya kuyrukta")
        }
        let p = safe_path(Path::new(&self.settings.root), path)?;
        let m = fs::metadata(&p)?;
        if m.modified()?.elapsed().unwrap_or(Duration::ZERO)
            < Duration::from_secs(self.settings.stability_secs)
        {
            bail!("Dosya henüz kararlı değil")
        }
        let hash = checksum(&p)?;
        let remote = self.cloud.stat(path)?.context("Bulut kopyası bulunamadı")?;
        if hash != e.checksum
            || m.len() != e.size
            || stamp(&m)? != e.modified
            || remote.checksum != hash
            || remote.size != m.len()
            || Some(&remote.id) != e.remote_id.as_ref()
        {
            bail!("Yerel ve uzak kopya eşleşmiyor; hiçbir dosya kaldırılmadı")
        }
        Ok(ArchivePlan {
            path: path.into(),
            size: e.size,
            checksum: hash,
            remote_id: remote.id,
            warning:
                "Dosya çöp kutusuna taşınır. Alan, çöp kutusu boşaltılana kadar boşalmayabilir."
                    .into(),
        })
    }
    pub fn archive(&mut self, plan: &ArchivePlan, confirmed: bool) -> Result<()> {
        if !confirmed {
            bail!("Açık onay gerekli")
        }
        let fresh = self.archive_plan(&plan.path)?;
        if fresh.checksum != plan.checksum
            || fresh.remote_id != plan.remote_id
            || fresh.size != plan.size
        {
            bail!("Önizleme eskidi")
        }
        let path = safe_path(Path::new(&self.settings.root), &plan.path)?;
        // Recheck immediately before OS trash. Never unlink user data directly.
        if checksum(&path)? != plan.checksum {
            bail!("Dosya değişti")
        }
        self.db.conn.execute(
            "UPDATE file_manifest SET status='archiving' WHERE path=?1",
            [&plan.path],
        )?;
        let stage = path.with_file_name(format!("{}.mutfak-part", uuid::Uuid::new_v4()));
        fs::rename(&path, &stage)?;
        let outcome = (|| -> Result<()> {
            if is_link(&fs::symlink_metadata(&stage)?)
                || checksum(&stage)? != plan.checksum
                || fs::metadata(&stage)?.len() != plan.size
            {
                bail!("Dosya son kontrolden sonra değişti; arşivleme iptal edildi")
            }
            trash::delete(&stage)?;
            Ok(())
        })();
        if let Err(err) = outcome {
            if !path.exists() {
                let _ = fs::rename(&stage, &path);
            }
            self.db.conn.execute("UPDATE file_manifest SET status='error',error='Arşivleme tamamlanamadı; yerel kopyayı denetleyin' WHERE path=?1",[&plan.path])?;
            return Err(err);
        }
        let tx = self.db.conn.transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO archived_files VALUES(?1,?2,?3,?4,?5)",
            params![
                plan.path,
                plan.remote_id,
                plan.checksum,
                plan.size as i64,
                now()
            ],
        )?;
        tx.execute(
            "UPDATE file_manifest SET status='cloud_only' WHERE path=?1",
            [&plan.path],
        )?;
        tx.commit()?;
        self.db.log(&format!(
            "{} çöp kutusuna taşındı; bulut kopyası korundu",
            plan.path
        ))?;
        Ok(())
    }
    pub fn restore(&mut self, path: &str) -> Result<()> {
        let e = self
            .db
            .entries()?
            .into_iter()
            .find(|e| e.path == path)
            .context("Kayıt yok")?;
        if e.kind != "file" || e.checksum.is_empty() {
            bail!("Doğrulanmış dosya yok")
        }
        let remote = self.cloud.stat(path)?.context("Bulut kopyası yok")?;
        if Some(remote.id) != e.remote_id || remote.checksum != e.checksum {
            bail!("Bulut kopyası değişti")
        }
        let dest = safe_path(Path::new(&self.settings.root), path)?;
        if dest.exists() {
            bail!("Yerel dosya var; üzerine yazılmaz. Önce yerel kopyayı başka bir konuma taşıyın.")
        }
        fs::create_dir_all(dest.parent().context("Üst klasör yok")?)?;
        let temp = dest.with_file_name(format!("{}.mutfak-part", uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            self.cloud.download(path, &temp)?;
            if checksum(&temp)? != e.checksum || fs::metadata(&temp)?.len() != e.size {
                bail!("İndirme doğrulanamadı")
            }
            // hard_link is atomic and refuses to replace an existing path.
            fs::hard_link(&temp, &dest)?;
            Ok(())
        })();
        let _ = fs::remove_file(&temp);
        result?;
        self.requeue_or_restore(path)?;
        self.db
            .log(&format!("{path} orijinal konumuna geri yüklendi"))?;
        Ok(())
    }
    pub fn list_versions(&self, path: &str) -> Result<Vec<FileVersion>> {
        crate::security::relative(path)?;
        self.db.file_versions(path)
    }
    pub fn restore_version(&mut self, path: &str, version_id: i64) -> Result<()> {
        crate::security::relative(path)?;
        let (remote_path, expected_checksum): (String, String) = self
            .db
            .conn
            .query_row(
                "SELECT remote_path, checksum FROM file_versions WHERE id=?1 AND path=?2",
                params![version_id, path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .context("Sürüm kaydı bulunamadı")?;

        let dest = safe_path(Path::new(&self.settings.root), path)?;
        if dest.exists() {
            bail!("Yerel dosya var; üzerine yazılmaz. Sürümü geri yüklemek için lütfen mevcut yerel dosyayı yeniden adlandırın veya taşıyın.")
        }
        fs::create_dir_all(dest.parent().context("Üst klasör yok")?)?;
        let temp = dest.with_file_name(format!("{}.mutfak-part", uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            self.cloud.download(&remote_path, &temp)?;
            if checksum(&temp)? != expected_checksum {
                bail!("İndirilen sürüm checksum doğrulaması başarısız")
            }
            fs::hard_link(&temp, &dest)?;
            Ok(())
        })();
        let _ = fs::remove_file(&temp);
        result?;
        let m = fs::metadata(&dest)?;
        let tx = self.db.conn.transaction()?;
        tx.execute(
            "UPDATE file_manifest SET status='backed_up',size=?2,modified=?3,checksum=?4 WHERE path=?1",
            params![path, m.len() as i64, stamp(&m)?, expected_checksum],
        )?;
        tx.execute("DELETE FROM archived_files WHERE path=?1", [path])?;
        tx.commit()?;
        self.db
            .log(&format!("{path} geçmiş sürüme ({remote_path}) geri yüklendi"))?;
        Ok(())
    }
    pub fn prioritize(&mut self, path: &str) -> Result<()> {
        crate::security::relative(path)?;
        self.db.prioritize(path)?;
        self.db.log(&format!("{path} yükleme sırasında en başa alındı"))?;
        Ok(())
    }
    pub fn create_project_folder(&mut self, name: &str) -> Result<Vec<String>> {
        let folder_name = crate::security::project_folder_name(name)?;
        let root = Path::new(&self.settings.root).canonicalize()?;
        let project_dir = root.join(&folder_name);
        if project_dir.exists() {
            bail!("Bu isimde bir proje klasörü zaten mevcut: {folder_name}");
        }
        fs::create_dir_all(&project_dir)?;
        let subfolders = [
            "01_Ham_Gorseller",
            "02_Tasarim_PSD_AI",
            "03_Baski_Hazir_PDF",
            "04_Musteri_Onizleme_JPG",
            "05_Kurumsal_Kimlik",
        ];
        let mut created = Vec::new();
        for sub in &subfolders {
            let sub_path = project_dir.join(sub);
            fs::create_dir_all(&sub_path)?;
            let keep_file = sub_path.join(".keep");
            let _ = fs::write(&keep_file, b"");
            created.push(format!("{folder_name}/{sub}"));
        }
        self.db.activity(&format!("Yeni proje klasörü oluşturuldu: {folder_name}"))?;
        Ok(created)
    }
    pub fn drive_quota(&self) -> Result<DriveQuota> {
        let entries = self.db.entries()?;
        let used: u64 = entries.iter().filter(|e| e.status == "backed_up").map(|e| e.size).sum();
        let total = 5 * 1024 * 1024 * 1024 * 1024u64; // 5 TB
        let free = total.saturating_sub(used);
        Ok(DriveQuota {
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            trash_bytes: 0,
        })
    }
    fn requeue_or_restore(&mut self, path: &str) -> Result<()> {
        let m = fs::metadata(safe_path(Path::new(&self.settings.root), path)?)?;
        self.db.conn.execute(
            "UPDATE file_manifest SET status='backed_up',modified=?2 WHERE path=?1",
            params![path, stamp(&m)?],
        )?;
        self.db
            .conn
            .execute("DELETE FROM archived_files WHERE path=?1", [path])?;
        Ok(())
    }
}
pub fn stamp(m: &fs::Metadata) -> Result<String> {
    Ok(m.modified()?
        .duration_since(UNIX_EPOCH)?
        .as_nanos()
        .to_string())
}
impl CloudProvider for Box<dyn CloudProvider> {
    fn stat(&mut self, p: &str) -> Result<Option<crate::cloud::RemoteFile>> {
        (**self).stat(p)
    }
    fn mkdir(&mut self, p: &str) -> Result<crate::cloud::RemoteFile> {
        (**self).mkdir(p)
    }
    fn upload(&mut self, l: &Path, p: &str) -> Result<crate::cloud::RemoteFile> {
        (**self).upload(l, p)
    }
    fn download(&mut self, p: &str, d: &Path) -> Result<()> {
        (**self).download(p, d)
    }
    fn claim_device(&mut self, d: &str) -> Result<()> {
        (**self).claim_device(d)
    }
    fn archive_version(&mut self, p: &str, v: &str) -> Result<()> {
        (**self).archive_version(p, v)
    }
}
