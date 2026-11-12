use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub user: String,
    pub root: String,
    pub folder_id: String,
    pub mock: bool,
    pub stability_secs: u64,
    pub scan_secs: u64,
    pub bandwidth: String,
    pub exclude_dev: bool,
    pub versions: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            user: "Burak".into(),
            root: String::new(),
            folder_id: String::new(),
            mock: true,
            stability_secs: 30,
            scan_secs: 600,
            bandwidth: String::new(),
            exclude_dev: false,
            versions: false,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: String,
    pub checksum: String,
    pub status: String,
    pub remote_id: Option<String>,
    pub parent_id: Option<String>,
    pub last_success: Option<i64>,
    pub retry: u32,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Activity {
    pub at: i64,
    pub message: String,
}
pub struct Database {
    pub conn: Connection,
}
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("BEGIN;
          CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, user TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS file_manifest(id INTEGER PRIMARY KEY, device_id TEXT NOT NULL, path TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, modified TEXT NOT NULL, checksum TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, remote_id TEXT, parent_id TEXT, last_success INTEGER, retry INTEGER NOT NULL DEFAULT 0, error TEXT);
          CREATE TABLE IF NOT EXISTS upload_queue(path TEXT PRIMARY KEY REFERENCES file_manifest(path), available INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS activity_log(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, message TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS archived_files(path TEXT PRIMARY KEY, remote_id TEXT NOT NULL, checksum TEXT NOT NULL, size INTEGER NOT NULL, archived_at INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS file_versions(id INTEGER PRIMARY KEY,path TEXT NOT NULL,remote_path TEXT NOT NULL,checksum TEXT NOT NULL,created INTEGER NOT NULL);
          PRAGMA user_version=1;
          COMMIT;
          UPDATE file_manifest SET status='pending' WHERE status IN ('uploading','archiving');")?;
        Ok(Self { conn })
    }
    pub fn settings(&self) -> Result<Option<Settings>> {
        let mut st = self.conn.prepare("SELECT json FROM settings WHERE id=1")?;
        let v = st
            .query_map([], |r| r.get::<_, String>(0))?
            .next()
            .transpose()?;
        Ok(v.map(|s| serde_json::from_str(&s)).transpose()?)
    }
    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
            [serde_json::to_string(s)?],
        )?;
        Ok(())
    }
    pub fn device(&self, user: &str) -> Result<String> {
        let mut st = self.conn.prepare("SELECT id FROM devices LIMIT 1")?;
        if let Some(id) = st
            .query_map([], |r| r.get::<_, String>(0))?
            .next()
            .transpose()?
        {
            return Ok(id);
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.conn
            .execute("INSERT INTO devices VALUES(?1,?2)", params![id, user])?;
        Ok(id)
    }
    pub fn entries(&self) -> Result<Vec<Entry>> {
        let mut st=self.conn.prepare("SELECT path,kind,size,modified,checksum,status,remote_id,parent_id,last_success,retry,error FROM file_manifest ORDER BY path")?;
        let rows = st.query_map([], |r| {
            Ok(Entry {
                path: r.get(0)?,
                kind: r.get(1)?,
                size: r.get::<_, i64>(2)? as u64,
                modified: r.get(3)?,
                checksum: r.get(4)?,
                status: r.get(5)?,
                remote_id: r.get(6)?,
                parent_id: r.get(7)?,
                last_success: r.get(8)?,
                retry: r.get(9)?,
                error: r.get(10)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn log(&self, message: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO activity_log(at,message) VALUES(?1,?2)",
            params![now(), message],
        )?;
        self.conn.execute("DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT 1000)",[])?;
        Ok(())
    }
    pub fn activity(&self) -> Result<Vec<Activity>> {
        let mut st = self
            .conn
            .prepare("SELECT at,message FROM activity_log ORDER BY id DESC LIMIT 100")?;
        let rows = st
            .query_map([], |r| {
                Ok(Activity {
                    at: r.get(0)?,
                    message: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
