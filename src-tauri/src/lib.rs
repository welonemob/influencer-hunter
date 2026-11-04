use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{Manager, State};

struct AppState {
    db_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Blogger {
    id: i64,
    platform: String,
    nickname: String,
    profile_url: String,
    niche: String,
    followers: Option<i64>,
    city: String,
    country: String,
    contacts: String,
    manager_status: String,
    manager_reason: String,
    median_views: Option<i64>,
    reach_percent: Option<f64>,
    activity: String,
    commercial_potential: String,
    notes: String,
    status: String,
    source_url: String,
    checked_at: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BloggerInput {
    platform: String,
    nickname: String,
    profile_url: String,
    niche: String,
    followers: Option<i64>,
    city: String,
    country: String,
    contacts: String,
    manager_status: String,
    manager_reason: String,
    median_views: Option<i64>,
    reach_percent: Option<f64>,
    activity: String,
    commercial_potential: String,
    notes: String,
    status: String,
    source_url: String,
    checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Advertiser {
    id: i64,
    name: String,
    website: String,
    category: String,
    city: String,
    country: String,
    contacts: String,
    marketing_contact: String,
    notes: String,
    source_url: String,
    checked_at: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvertiserInput {
    name: String,
    website: String,
    category: String,
    city: String,
    country: String,
    contacts: String,
    marketing_contact: String,
    notes: String,
    source_url: String,
    checked_at: String,
}

fn connect(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Не удалось открыть SQLite: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")
        .map_err(|e| format!("Не удалось настроить SQLite: {e}"))?;
    Ok(conn)
}

fn init_db(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку данных: {e}"))?;
    }
    let conn = connect(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL;").map_err(|e| format!("Не удалось включить WAL: {e}"))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS bloggers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          nickname TEXT NOT NULL,
          profile_url TEXT NOT NULL DEFAULT '',
          niche TEXT NOT NULL DEFAULT '',
          followers INTEGER,
          city TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          contacts TEXT NOT NULL DEFAULT '',
          manager_status TEXT NOT NULL DEFAULT 'Не удалось определить',
          manager_reason TEXT NOT NULL DEFAULT '',
          median_views INTEGER,
          reach_percent REAL,
          activity TEXT NOT NULL DEFAULT 'Недостаточно данных',
          commercial_potential TEXT NOT NULL DEFAULT 'Недостаточно данных',
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Новый',
          source_url TEXT NOT NULL DEFAULT '',
          checked_at TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_bloggers_platform ON bloggers(platform);
        CREATE INDEX IF NOT EXISTS idx_bloggers_nickname ON bloggers(nickname);
        CREATE INDEX IF NOT EXISTS idx_bloggers_status ON bloggers(status);
        CREATE TABLE IF NOT EXISTS advertisers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          website TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          country TEXT NOT NULL DEFAULT '',
          contacts TEXT NOT NULL DEFAULT '',
          marketing_contact TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          checked_at TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_advertisers_name ON advertisers(name);
        "#,
    )
    .map_err(|e| format!("Не удалось создать таблицы базы: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_bloggers(state: State<'_, AppState>) -> Result<Vec<Blogger>, String> {
    let conn = connect(&state.db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, platform, nickname, profile_url, niche, followers, city, country, contacts, manager_status, manager_reason, median_views, reach_percent, activity, commercial_potential, notes, status, source_url, checked_at, created_at FROM bloggers ORDER BY id DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Blogger {
        id: r.get(0)?, platform: r.get(1)?, nickname: r.get(2)?, profile_url: r.get(3)?,
        niche: r.get(4)?, followers: r.get(5)?, city: r.get(6)?, country: r.get(7)?, contacts: r.get(8)?,
        manager_status: r.get(9)?, manager_reason: r.get(10)?, median_views: r.get(11)?, reach_percent: r.get(12)?,
        activity: r.get(13)?, commercial_potential: r.get(14)?, notes: r.get(15)?, status: r.get(16)?,
        source_url: r.get(17)?, checked_at: r.get(18)?, created_at: r.get(19)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_blogger(input: BloggerInput, id: Option<i64>, state: State<'_, AppState>) -> Result<i64, String> {
    let conn = connect(&state.db_path)?;
    if let Some(existing_id) = id {
        conn.execute(
            "UPDATE bloggers SET platform=?1,nickname=?2,profile_url=?3,niche=?4,followers=?5,city=?6,country=?7,contacts=?8,manager_status=?9,manager_reason=?10,median_views=?11,reach_percent=?12,activity=?13,commercial_potential=?14,notes=?15,status=?16,source_url=?17,checked_at=?18 WHERE id=?19",
            params![input.platform,input.nickname,input.profile_url,input.niche,input.followers,input.city,input.country,input.contacts,input.manager_status,input.manager_reason,input.median_views,input.reach_percent,input.activity,input.commercial_potential,input.notes,input.status,input.source_url,input.checked_at,existing_id],
        ).map_err(|e| format!("Не удалось обновить блогера: {e}"))?;
        Ok(existing_id)
    } else {
        let duplicate: Option<i64> = conn.query_row(
            "SELECT id FROM bloggers WHERE platform=?1 AND (lower(nickname)=lower(?2) OR (?3 <> '' AND profile_url=?3)) LIMIT 1",
            params![input.platform,input.nickname,input.profile_url], |r| r.get(0)
        ).optional().map_err(|e| e.to_string())?;
        if let Some(duplicate_id) = duplicate {
            return Err(format!("Этот профиль уже есть в базе (запись №{duplicate_id})."));
        }
        conn.execute(
            "INSERT INTO bloggers (platform,nickname,profile_url,niche,followers,city,country,contacts,manager_status,manager_reason,median_views,reach_percent,activity,commercial_potential,notes,status,source_url,checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            params![input.platform,input.nickname,input.profile_url,input.niche,input.followers,input.city,input.country,input.contacts,input.manager_status,input.manager_reason,input.median_views,input.reach_percent,input.activity,input.commercial_potential,input.notes,input.status,input.source_url,input.checked_at],
        ).map_err(|e| format!("Не удалось сохранить блогера: {e}"))?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
fn delete_blogger(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    connect(&state.db_path)?.execute("DELETE FROM bloggers WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_advertisers(state: State<'_, AppState>) -> Result<Vec<Advertiser>, String> {
    let conn = connect(&state.db_path)?;
    let mut stmt = conn.prepare("SELECT id,name,website,category,city,country,contacts,marketing_contact,notes,source_url,checked_at,created_at FROM advertisers ORDER BY id DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Advertiser {
        id:r.get(0)?, name:r.get(1)?, website:r.get(2)?, category:r.get(3)?, city:r.get(4)?, country:r.get(5)?,
        contacts:r.get(6)?, marketing_contact:r.get(7)?, notes:r.get(8)?, source_url:r.get(9)?, checked_at:r.get(10)?, created_at:r.get(11)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_advertiser(input: AdvertiserInput, id: Option<i64>, state: State<'_, AppState>) -> Result<i64, String> {
    let conn = connect(&state.db_path)?;
    if let Some(existing_id) = id {
        conn.execute("UPDATE advertisers SET name=?1,website=?2,category=?3,city=?4,country=?5,contacts=?6,marketing_contact=?7,notes=?8,source_url=?9,checked_at=?10 WHERE id=?11",
            params![input.name,input.website,input.category,input.city,input.country,input.contacts,input.marketing_contact,input.notes,input.source_url,input.checked_at,existing_id]).map_err(|e| e.to_string())?;
        Ok(existing_id)
    } else {
        conn.execute("INSERT INTO advertisers (name,website,category,city,country,contacts,marketing_contact,notes,source_url,checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![input.name,input.website,input.category,input.city,input.country,input.contacts,input.marketing_contact,input.notes,input.source_url,input.checked_at]).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
fn delete_advertiser(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    connect(&state.db_path)?.execute("DELETE FROM advertisers WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn backup_database(destination: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = connect(&state.db_path)?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);").map_err(|e| e.to_string())?;
    drop(conn);
    fs::copy(&state.db_path, &destination).map_err(|e| format!("Не удалось создать резервную копию: {e}"))?;
    Ok(())
}

#[tauri::command]
fn write_export_file(destination: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&destination, bytes).map_err(|e| format!("Не удалось сохранить файл: {e}"))
}

#[tauri::command]
fn database_location(state: State<'_, AppState>) -> String {
    state.db_path.to_string_lossy().to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("influencer_hunter.sqlite");
            init_db(&db_path).map_err(std::io::Error::other)?;
            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bloggers, save_blogger, delete_blogger, get_advertisers, save_advertiser,
            delete_advertiser, backup_database, write_export_file, database_location
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска Influencer Hunter");
}
