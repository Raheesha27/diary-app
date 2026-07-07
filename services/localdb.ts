import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDB() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("diary.db");
    await initSchema(db);
  }
  return db;
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS local_entries (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      caption TEXT,
      image_local_uri TEXT,
      image_remote_url TEXT,
      audio_local_uri TEXT,
      audio_remote_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
  `);
}

export async function upsertLocalEntry(entry: {
  id: string;
  user_id: string;
  entry_date: string;
  caption: string | null;
  image_local_uri: string | null;
  image_remote_url: string | null;
  audio_local_uri: string | null;
  audio_remote_url: string | null;
  sync_status: string;
}) {
  const database = await getDB();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO local_entries
      (id, user_id, entry_date, caption, image_local_uri, image_remote_url, audio_local_uri, audio_remote_url, created_at, updated_at, sync_status)
     VALUES ($id, $user_id, $entry_date, $caption, $image_local_uri, $image_remote_url, $audio_local_uri, $audio_remote_url, $now, $now, $sync_status)
     ON CONFLICT(id) DO UPDATE SET
       caption=excluded.caption,
       image_local_uri=excluded.image_local_uri,
       image_remote_url=excluded.image_remote_url,
       audio_local_uri=excluded.audio_local_uri,
       audio_remote_url=excluded.audio_remote_url,
       updated_at=excluded.updated_at,
       sync_status=excluded.sync_status;`,
    {
      $id: entry.id,
      $user_id: entry.user_id,
      $entry_date: entry.entry_date,
      $caption: entry.caption,
      $image_local_uri: entry.image_local_uri,
      $image_remote_url: entry.image_remote_url,
      $audio_local_uri: entry.audio_local_uri,
      $audio_remote_url: entry.audio_remote_url,
      $now: now,
      $sync_status: entry.sync_status,
    },
  );
}

export async function getAllLocalEntries() {
  const database = await getDB();
  const rows = await database.getAllAsync("SELECT * FROM local_entries;");
  return rows;
}
export async function getLocalEntryByDate(userId: string, entryDate: string) {
  const database = await getDB();
  const row = await database.getFirstAsync(
    "SELECT * FROM local_entries WHERE user_id = $userId AND entry_date = $entryDate;",
    { $userId: userId, $entryDate: entryDate },
  );
  return row;
}
export async function getAllLocalEntryDates(userId: string) {
  const database = await getDB();
  const rows = await database.getAllAsync(
    "SELECT DISTINCT entry_date FROM local_entries WHERE user_id = $userId;",
    { $userId: userId },
  );
  return rows.map((row: any) => row.entry_date);
}
