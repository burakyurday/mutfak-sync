//! Exercises the actual pinned sidecar without accessing Google or user files.
use mutfak_sync::cloud::{CloudProvider, RcloneProvider};
use std::{fs, path::PathBuf};
#[test]
fn pinned_rclone_roundtrip_and_empty_folder() {
    let suffix = std::env::consts::EXE_SUFFIX;
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
    let binary =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("binaries/rclone-{target}{suffix}"));
    assert!(
        binary.is_file(),
        "Run npm run sidecar before integration tests"
    );
    let temp = tempfile::tempdir().unwrap();
    let work = temp.path().join("remote");
    fs::create_dir_all(&work).unwrap();
    let config = temp.path().join("rclone.conf");
    fs::write(&config, "[mutfak]\ntype = local\n").unwrap();
    let mut cloud = RcloneProvider {
        binary,
        config,
        device_folder: "Burak PC".into(),
        bandwidth: String::new(),
        work: work.clone(),
    };
    cloud.claim_device("test-device").unwrap();
    cloud.mkdir("Boş/İç İçe").unwrap();
    let source = temp.path().join("source.psd");
    fs::write(&source, b"test PSD contents").unwrap();
    let uploaded = cloud.upload(&source, "Müşteriler/Kasım Story.psd").unwrap();
    assert_eq!(uploaded.size, 17);
    assert_eq!(
        uploaded.checksum,
        mutfak_sync::security::checksum(&source).unwrap()
    );
    let restored = temp.path().join("restored.psd");
    cloud
        .download("Müşteriler/Kasım Story.psd", &restored)
        .unwrap();
    assert_eq!(fs::read(restored).unwrap(), b"test PSD contents");
    assert!(work.join("Burak PC/Boş/İç İçe").is_dir());
    assert!(!work.join("Naz PC").exists());
}
