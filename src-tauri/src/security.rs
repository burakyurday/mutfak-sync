use anyhow::{bail, Context, Result};
use md5::{Digest, Md5};
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

pub fn relative(path: &str) -> Result<PathBuf> {
    let p = Path::new(path);
    if path.is_empty()
        || path.contains('\\')
        || path.contains(':')
        || p.is_absolute()
        || p.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        bail!("Güvensiz göreceli yol");
    }
    Ok(p.to_path_buf())
}
pub fn safe_path(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = relative(rel)?;
    let root = root.canonicalize()?;
    let mut current = root.clone();
    for c in rel.components() {
        current.push(c);
        if let Ok(meta) = fs::symlink_metadata(&current) {
            if is_link(&meta) {
                bail!("Sembolik bağlantı veya reparse point reddedildi");
            }
            if !current.canonicalize()?.starts_with(&root) {
                bail!("Kök dışına erişim reddedildi");
            }
        }
    }
    Ok(current)
}
pub fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_type().is_symlink() || meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
pub fn checksum(path: &Path) -> Result<String> {
    let mut f = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) => {
            #[cfg(windows)]
            if e.raw_os_error() == Some(32) {
                bail!("LOCKED: Dosya başka bir uygulama (Photoshop vb.) tarafından kullanımda veya kaydediliyor");
            }
            return Err(e).context("Dosya okunamıyor");
        }
    };
    let mut md = Md5::new();
    let mut buf = [0u8; 1024 * 128];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        md.update(&buf[..n]);
    }
    Ok(hex::encode(md.finalize()))
}
pub fn private_file(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(windows)]
    {
        // AppData inherits the current user's ACL. Explicitly remove broad inherited grants.
        let user = std::env::var("USERNAME")?;
        let mut command = std::process::Command::new("icacls");
        hide_windows_console(&mut command);
        let status = command
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &format!("{user}:(F)"),
                "SYSTEM:(F)",
            ])
            .output()?;
        if !status.status.success() {
            bail!("Güvenli dosya izinleri ayarlanamadı");
        }
    }
    Ok(())
}

/// Prevent child command-line tools from flashing a console window in packaged Windows builds.
pub fn hide_windows_console(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}
pub fn excluded(rel: &str, optional: bool) -> bool {
    is_excluded(rel, optional, "")
}

pub fn is_excluded(rel: &str, optional: bool, custom_patterns: &str) -> bool {
    let built_in = rel.split('/').any(|name| {
        matches!(
            name,
            ".DS_Store"
                | "Thumbs.db"
                | "desktop.ini"
                | ".mutfak-sync"
                | ".mutfak-versions"
                | ".syncignore"
        ) || name.starts_with("~$")
            || name.ends_with(".mutfak-part")
            || (optional && matches!(name, "node_modules" | ".git" | "target" | ".next"))
    });
    if built_in {
        return true;
    }
    if custom_patterns.trim().is_empty() {
        return false;
    }
    let rel_lower = rel.to_ascii_lowercase();
    for pat in custom_patterns.split([',', '\n', ';']) {
        let raw = pat.trim();
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let p = raw.replace('\\', "/").to_ascii_lowercase();
        let p = p.trim_start_matches('/');
        if let Some(ext) = p.strip_prefix("*.") {
            if rel_lower.ends_with(&format!(".{ext}")) {
                return true;
            }
        } else if p.ends_with('/') {
            let dir = p.trim_end_matches('/');
            if rel_lower.split('/').any(|part| part == dir) {
                return true;
            }
        } else if rel_lower.split('/').any(|part| part == p) || rel_lower == p {
            return true;
        }
    }
    false
}

pub fn clean_bandwidth(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("off") || trimmed == "0" {
        return String::new();
    }
    if trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == ':' || c == '.') {
        trimmed.to_string()
    } else {
        String::new()
    }
}
pub fn folder_id(value: &str) -> Result<String> {
    let trimmed = value.trim();
    let id = if let Some((_, rest)) = trimmed.split_once("/folders/") {
        rest.split(['?', '#', '/']).next().unwrap_or("").trim()
    } else {
        trimmed
    };
    if id.len() < 10
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        bail!("Geçerli bir Google Drive klasör ID veya paylaşım bağlantısı girin");
    }
    Ok(id.to_owned())
}

#[cfg(feature = "desktop")]
pub fn save_rclone_config(text: &str) -> Result<()> {
    const CHUNK_SIZE: usize = 200;
    let chars: Vec<char> = text.chars().collect();
    let chunks: Vec<String> = chars
        .chunks(CHUNK_SIZE)
        .map(|c| c.iter().collect::<String>())
        .collect();
    for (i, chunk) in chunks.iter().enumerate() {
        keyring::Entry::new("com.mutfakajans.sync", &format!("rclone-config-{i}"))?
            .set_password(chunk)
            .context("İşletim sistemi güvenli kasasına kayıt başarısız")?;
    }
    keyring::Entry::new("com.mutfakajans.sync", "rclone-config-count")?
        .set_password(&chunks.len().to_string())
        .context("İşletim sistemi güvenli kasasına kayıt başarısız")?;
    for i in chunks.len()..(chunks.len() + 10) {
        if let Ok(entry) =
            keyring::Entry::new("com.mutfakajans.sync", &format!("rclone-config-{i}"))
        {
            let _ = entry.delete_credential();
        }
    }
    Ok(())
}

#[cfg(feature = "desktop")]
pub fn load_rclone_config() -> Result<String> {
    if let Ok(count_entry) = keyring::Entry::new("com.mutfakajans.sync", "rclone-config-count") {
        if let Ok(count_str) = count_entry.get_password() {
            if let Ok(count) = count_str.parse::<usize>() {
                let mut combined = String::new();
                for i in 0..count {
                    let entry =
                        keyring::Entry::new("com.mutfakajans.sync", &format!("rclone-config-{i}"))?;
                    let part = entry
                        .get_password()
                        .context("Google bağlantı parçası güvenli kasada bulunamadı")?;
                    combined.push_str(&part);
                }
                return Ok(combined);
            }
        }
    }
    let entry = keyring::Entry::new("com.mutfakajans.sync", "rclone-config")?;
    entry
        .get_password()
        .context("Google bağlantısı güvenli kasada bulunamadı")
}

#[cfg(feature = "desktop")]
pub fn delete_rclone_config() {
    if let Ok(count_entry) = keyring::Entry::new("com.mutfakajans.sync", "rclone-config-count") {
        if let Ok(count_str) = count_entry.get_password() {
            if let Ok(count) = count_str.parse::<usize>() {
                for i in 0..count {
                    if let Ok(entry) =
                        keyring::Entry::new("com.mutfakajans.sync", &format!("rclone-config-{i}"))
                    {
                        let _ = entry.delete_credential();
                    }
                }
            }
        }
        let _ = count_entry.delete_credential();
    }
    if let Ok(entry) = keyring::Entry::new("com.mutfakajans.sync", "rclone-config") {
        let _ = entry.delete_credential();
    }
}
