use crate::security::{checksum, relative, safe_path};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFile {
    pub id: String,
    pub parent_id: String,
    pub size: u64,
    pub checksum: String,
    pub is_dir: bool,
}
pub trait CloudProvider: Send {
    fn stat(&mut self, path: &str) -> Result<Option<RemoteFile>>;
    fn mkdir(&mut self, path: &str) -> Result<RemoteFile>;
    fn upload(&mut self, local: &Path, path: &str) -> Result<RemoteFile>;
    fn download(&mut self, path: &str, dest: &Path) -> Result<()>;
    fn claim_device(&mut self, device: &str) -> Result<()>;
    fn archive_version(&mut self, path: &str, version: &str) -> Result<()>;
}
/// Filesystem-backed cloud used only with a dedicated application data directory.
pub struct MockCloudProvider {
    pub root: PathBuf,
    pub offline: bool,
    pub denied: bool,
    pub duplicates: bool,
    pub uploads: u32,
}
impl MockCloudProvider {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            offline: false,
            denied: false,
            duplicates: false,
            uploads: 0,
        })
    }
    fn check(&self) -> Result<()> {
        if self.denied {
            bail!("AUTH: Erişim izni kaldırıldı")
        }
        if self.offline {
            bail!("OFFLINE: Bağlantı yok")
        }
        if self.duplicates {
            bail!("AMBIGUOUS: Aynı isimde birden fazla uzak dosya")
        }
        Ok(())
    }
    fn path(&self, path: &str) -> Result<PathBuf> {
        safe_path(&self.root, path)
    }
}
impl CloudProvider for MockCloudProvider {
    fn stat(&mut self, path: &str) -> Result<Option<RemoteFile>> {
        self.check()?;
        let p = self.path(path)?;
        if !p.exists() {
            return Ok(None);
        }
        let m = fs::metadata(&p)?;
        Ok(Some(RemoteFile {
            id: format!("mock:{path}"),
            parent_id: format!(
                "mock:{}",
                Path::new(path).parent().unwrap_or(Path::new("")).display()
            ),
            size: m.len(),
            checksum: if m.is_dir() {
                String::new()
            } else {
                checksum(&p)?
            },
            is_dir: m.is_dir(),
        }))
    }
    fn mkdir(&mut self, path: &str) -> Result<RemoteFile> {
        self.check()?;
        fs::create_dir_all(self.path(path)?)?;
        self.stat(path)?.context("Klasör bulunamadı")
    }
    fn upload(&mut self, local: &Path, path: &str) -> Result<RemoteFile> {
        self.check()?;
        let p = self.path(path)?;
        fs::create_dir_all(p.parent().unwrap())?;
        fs::copy(local, &p)?;
        self.uploads += 1;
        self.stat(path)?.context("Yükleme bulunamadı")
    }
    fn download(&mut self, path: &str, dest: &Path) -> Result<()> {
        self.check()?;
        fs::copy(self.path(path)?, dest)?;
        Ok(())
    }
    fn claim_device(&mut self, device: &str) -> Result<()> {
        self.check()?;
        let p = self.root.join(".mutfak-device");
        if p.exists() && fs::read_to_string(&p)? != device {
            bail!("DEVICE: Bu kullanıcı hedefi başka bir cihaza bağlı")
        }
        fs::write(p, device)?;
        Ok(())
    }
    fn archive_version(&mut self, path: &str, version: &str) -> Result<()> {
        let p = self.path(path)?;
        let target = self.path(version)?;
        if p.exists() {
            fs::create_dir_all(target.parent().unwrap())?;
            fs::copy(p, target)?;
        }
        Ok(())
    }
}

pub struct RcloneProvider {
    pub binary: PathBuf,
    pub config: PathBuf,
    pub device_folder: String,
    pub bandwidth: String,
    pub work: PathBuf,
}
impl RcloneProvider {
    fn dest(&self, path: &str) -> Result<String> {
        relative(path)?;
        Ok(format!("mutfak:{}/{path}", self.device_folder))
    }
    fn run(&self, args: &[String]) -> Result<String> {
        #[cfg(feature = "desktop")]
        let config = {
            use std::io::Write;
            let secret = crate::security::load_rclone_config()?;
            let path = self
                .work
                .join(format!("session-{}.conf", uuid::Uuid::new_v4()));
            let mut opts = fs::OpenOptions::new();
            opts.create_new(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                opts.mode(0o600);
            }
            let mut file = opts.open(&path)?;
            crate::security::private_file(&path)?;
            file.write_all(secret.as_bytes())?;
            path
        };
        #[cfg(not(feature = "desktop"))]
        let config = self.config.clone();
        let result = (|| -> Result<(bool, Vec<u8>, Option<String>)> {
            use std::io::{BufRead, Read};
            let is_transfer = args.first().is_some_and(|a| a == "copyto");
            let mut command = Command::new(&self.binary);
            crate::security::hide_windows_console(&mut command);
            command
                .current_dir(&self.work)
                .args(args)
                .arg("--config")
                .arg(&config)
                .args([
                    "--retries",
                    "1",
                    "--low-level-retries",
                    "3",
                    "--contimeout",
                    "15s",
                    "--timeout",
                    "5m",
                    "--use-json-log",
                    "--stats",
                    "1s",
                    "--stats-log-level",
                    "NOTICE",
                    "--log-level",
                    "NOTICE",
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .stdin(Stdio::null());
            let mut child = command
                .spawn()
                .context("Paketlenmiş Rclone başlatılamadı")?;
            let mut stdout = child.stdout.take().context("Rclone stdout yok")?;
            let reader = std::thread::spawn(move || {
                let mut bytes = Vec::new();
                stdout.read_to_end(&mut bytes).map(|_| bytes)
            });
            let stderr = child.stderr.take().context("Rclone stderr yok")?;
            let mut classified_error: Option<String> = None;
            for line in std::io::BufReader::new(stderr)
                .lines()
                .map_while(std::result::Result::ok)
            {
                if is_transfer {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                        if let Some(stats) = value.get("stats") {
                            let progress = serde_json::json!({"bytes":stats["bytes"].as_u64().unwrap_or(0),"total":stats["totalBytes"].as_u64().unwrap_or(0),"speed":stats["speed"].as_f64().unwrap_or(0.0)});
                            let _ = fs::write(
                                self.work.join("transfer.json"),
                                serde_json::to_vec(&progress)?,
                            );
                        }
                    }
                }
                if classified_error.is_none() {
                    let lower = line.to_ascii_lowercase();
                    if lower.contains("invalid_grant")
                        || lower.contains("token expired")
                        || lower.contains("oauth2: cannot fetch token")
                        || lower.contains("token has been expired or revoked")
                        || lower.contains("unauthorized")
                        || lower.contains("error 401")
                    {
                        classified_error = Some("AUTH: Google Drive oturumunun süresi doldu. Lütfen Ayarlar'dan yeniden bağlanın.".into());
                    } else if lower.contains("quotaexceeded")
                        || lower.contains("userratelimitexceeded")
                        || lower.contains("dailylimitexceeded")
                        || lower.contains("storagequotaexceeded")
                    {
                        classified_error = Some(
                            "QUOTA: Google Drive depolama alanı doldu veya günlük kota aşıldı."
                                .into(),
                        );
                    } else if lower.contains("ratelimitexceeded") {
                        classified_error = Some("RATE_LIMIT: Google Drive istek sınırı aşıldı; birazdan otomatik yeniden denenecek.".into());
                    } else if lower.contains("dial tcp")
                        || lower.contains("connection refused")
                        || lower.contains("connection reset")
                        || lower.contains("i/o timeout")
                        || lower.contains("no such host")
                        || lower.contains("network is unreachable")
                        || lower.contains("tls handshake timeout")
                        || lower.contains("read: connection reset by peer")
                    {
                        classified_error = Some("NETWORK: Ağ bağlantısı kurulamadı veya kesildi. İnternet bağlantınızı kontrol edin.".into());
                    } else if lower.contains("being used by another process")
                        || lower.contains("process cannot access the file")
                        || lower.contains("sharing violation")
                        || lower.contains("os error 32")
                    {
                        classified_error = Some("LOCKED: Dosya başka bir uygulama (Photoshop vb.) tarafından kullanımda veya kaydediliyor.".into());
                    }
                }
            }
            let status = child.wait()?;
            let bytes = reader
                .join()
                .map_err(|_| anyhow::anyhow!("Rclone stdout okuyucu hatası"))??;
            if is_transfer {
                let _ = fs::remove_file(self.work.join("transfer.json"));
            }
            Ok((status.success(), bytes, classified_error))
        })();
        #[cfg(feature = "desktop")]
        {
            let persist = (|| -> Result<()> {
                let refreshed = fs::read_to_string(&config)?;
                crate::security::save_rclone_config(&refreshed)?;
                Ok(())
            })();
            let _ = fs::remove_file(&config);
            persist?;
        }
        let (success, stdout, classified) = result?;
        if !success {
            if let Some(err) = classified {
                bail!("{err}");
            }
            // Never forward rclone output: it can contain credential material or URLs.
            bail!("DRIVE: Aktarım başarısız. Ağ, kota ve hesap yetkisini kontrol edin.");
        }
        Ok(String::from_utf8(stdout)?)
    }
    fn children(&self, parent: &str) -> Result<Vec<DriveItem>> {
        let dest = if parent.is_empty() {
            format!("mutfak:{}", self.device_folder)
        } else {
            self.dest(parent)?
        };
        Ok(serde_json::from_str(&self.run(&[
            "lsjson".into(),
            dest,
            "--hash".into(),
        ])?)?)
    }
    pub fn verify_scope(&self) -> Result<()> {
        if !matches!(self.device_folder.as_str(), "Burak PC" | "Naz PC") {
            bail!("Geçersiz cihaz hedefi")
        }
        let out = self.run(&["lsjson".into(), "mutfak:".into(), "--dirs-only".into()])?;
        let dirs: Vec<DriveItem> = serde_json::from_str(&out)?;
        if dirs.iter().filter(|d| d.name == self.device_folder).count() > 1 {
            bail!("AMBIGUOUS: Cihaz klasörü birden fazla")
        }
        self.run(&["mkdir".into(), format!("mutfak:{}", self.device_folder)])?;
        Ok(())
    }
    fn ensure_parents(&self, path: &str) -> Result<()> {
        let parts: Vec<_> = path.split('/').collect();
        for i in 0..parts.len().saturating_sub(1) {
            let parent = parts[..i].join("/");
            let matches: Vec<_> = self
                .children(&parent)?
                .into_iter()
                .filter(|v| v.name == parts[i])
                .collect();
            if matches.len() > 1 || matches.iter().any(|v| !v.is_dir) {
                bail!("AMBIGUOUS: Üst klasör belirsiz")
            }
            if matches.is_empty() {
                self.run(&["mkdir".into(), self.dest(&parts[..=i].join("/"))?])?;
            }
        }
        Ok(())
    }
}
#[derive(Deserialize)]
struct DriveItem {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "ID", default)]
    id: String,
    #[serde(rename = "Size")]
    size: i64,
    #[serde(rename = "IsDir")]
    is_dir: bool,
    #[serde(rename = "Hashes", default)]
    hashes: HashMap<String, String>,
}
impl CloudProvider for RcloneProvider {
    fn stat(&mut self, path: &str) -> Result<Option<RemoteFile>> {
        relative(path)?;
        let parts: Vec<_> = path.split('/').collect();
        let mut parent_id = String::new();
        for i in 0..parts.len() {
            let entries = self.children(&parts[..i].join("/"))?;
            let mut found = entries.into_iter().filter(|d| d.name == parts[i]);
            let Some(item) = found.next() else {
                return Ok(None);
            };
            if found.next().is_some() {
                bail!("AMBIGUOUS: Aynı isimde birden fazla Drive kaydı")
            }
            if i == parts.len() - 1 {
                return Ok(Some(RemoteFile {
                    id: item.id,
                    parent_id,
                    size: item.size.max(0) as u64,
                    checksum: item
                        .hashes
                        .get("MD5")
                        .or(item.hashes.get("md5"))
                        .cloned()
                        .unwrap_or_default(),
                    is_dir: item.is_dir,
                }));
            }
            if !item.is_dir {
                bail!("Üst yol klasör değil")
            }
            parent_id = item.id;
        }
        Ok(None)
    }
    fn mkdir(&mut self, path: &str) -> Result<RemoteFile> {
        self.ensure_parents(path)?;
        if let Some(f) = self.stat(path)? {
            if !f.is_dir {
                bail!("Klasör yolu dosyayla çakışıyor")
            }
            return Ok(f);
        }
        self.run(&["mkdir".into(), self.dest(path)?])?;
        self.stat(path)?.context("Klasör oluşturulamadı")
    }
    fn upload(&mut self, local: &Path, path: &str) -> Result<RemoteFile> {
        self.ensure_parents(path)?;
        if let Some(f) = self.stat(path)? {
            if f.is_dir {
                bail!("Dosya yolu klasörle çakışıyor")
            }
        }
        let mut args = vec![
            "copyto".into(),
            local.to_string_lossy().into_owned(),
            self.dest(path)?,
            "--checksum".into(),
            "--drive-chunk-size".into(),
            "16M".into(),
            "--transfers".into(),
            "1".into(),
        ];
        if !self.bandwidth.is_empty() {
            args.extend(["--bwlimit".into(), self.bandwidth.clone()]);
        }
        self.run(&args)?;
        self.stat(path)?.context("Yüklenen dosya doğrulanamadı")
    }
    fn download(&mut self, path: &str, dest: &Path) -> Result<()> {
        self.stat(path)?.context("Uzak dosya yok")?;
        self.run(&[
            "copyto".into(),
            self.dest(path)?,
            dest.to_string_lossy().into_owned(),
        ])?;
        Ok(())
    }
    fn claim_device(&mut self, device: &str) -> Result<()> {
        self.verify_scope()?;
        let temp = self.work.join("device-claim");
        if self.stat(".mutfak-device")?.is_some() {
            self.download(".mutfak-device", &temp)?;
            let existing = fs::read_to_string(&temp)?;
            fs::remove_file(&temp)?;
            if existing != device {
                bail!("DEVICE: Hedef başka bir cihaza bağlı")
            }
        } else {
            fs::write(&temp, device)?;
            let result = self.upload(&temp, ".mutfak-device");
            let _ = fs::remove_file(&temp);
            result?;
        }
        Ok(())
    }
    fn archive_version(&mut self, path: &str, version: &str) -> Result<()> {
        self.ensure_parents(version)?;
        self.stat(path)?.context("Önceki sürüm yok")?;
        self.run(&["copyto".into(), self.dest(path)?, self.dest(version)?])?;
        Ok(())
    }
}
