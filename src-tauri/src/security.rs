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
    let mut f = fs::File::open(path).context("Dosya okunamıyor")?;
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
    rel.split('/').any(|name| {
        matches!(
            name,
            ".DS_Store" | "Thumbs.db" | "desktop.ini" | ".mutfak-sync" | ".mutfak-versions"
        ) || name.starts_with("~$")
            || name.ends_with(".mutfak-part")
            || (optional && matches!(name, "node_modules" | ".git" | "target" | ".next"))
    })
}
pub fn folder_id(value: &str) -> Result<String> {
    let id = if let Some((_, rest)) = value.split_once("/folders/") {
        rest.split(['?', '#', '/']).next().unwrap_or("")
    } else {
        value
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
