import * as SQLite from 'expo-sqlite';
import { tileKeyFor, type Bounds } from '../lib/osm';
import type { Defibrillator, SyncStatus } from '../lib/types';

/**
 * Local SQLite store:
 *  - defibs:      every defibrillator seen (OSM + community), keyed by map tile, for offline use
 *  - tiles:       when each map tile was last downloaded
 *  - submissions: defibrillators added on this device and their cloud-sync state
 *  - w3w:         cached what3words addresses
 */

const SCHEMA_VERSION = 1;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS defibs (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      tile TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_defibs_tile ON defibs(tile);
    CREATE INDEX IF NOT EXISTS idx_defibs_latlng ON defibs(lat, lng);
    CREATE TABLE IF NOT EXISTS tiles (
      key TEXT PRIMARY KEY NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      photo_local_uri TEXT,
      sync_status TEXT NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS w3w (
      id TEXT PRIMARY KEY NOT NULL,
      words TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL
    );
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('lifedrop.db').then(async (db) => {
      await migrate(db);
      return db;
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const placeholders = (n: number) => new Array(n).fill('?').join(',');

/**
 * Write transactions share one connection, so they must not overlap
 * (SQLite cannot nest BEGIN). Every write goes through this queue.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialWrite<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => fn(await getDb()));
  writeQueue = run.catch(() => undefined);
  return run;
}

const INSERT_DEFIB =
  'INSERT OR REPLACE INTO defibs (id, source, lat, lng, tile, data, updated_at) VALUES ($id, $source, $lat, $lng, $tile, $data, $updated)';

async function insertDefibs(db: SQLite.SQLiteDatabase, defibs: Defibrillator[], now: number) {
  const stmt = await db.prepareAsync(INSERT_DEFIB);
  try {
    for (const d of defibs) {
      await stmt.executeAsync({
        $id: d.id,
        $source: d.source,
        $lat: d.latitude,
        $lng: d.longitude,
        $tile: tileKeyFor(d),
        $data: JSON.stringify(d),
        $updated: now,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

/* ---------------- tiles ---------------- */

export async function getTileTimes(keys: string[]): Promise<Record<string, number>> {
  if (keys.length === 0) return {};
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; fetched_at: number }>(
    `SELECT key, fetched_at FROM tiles WHERE key IN (${placeholders(keys.length)})`,
    keys,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.fetched_at]));
}

/** Replace the OSM data for some tiles with a fresh download. */
export function saveTileDefibs(tiles: string[], defibs: Defibrillator[]): Promise<void> {
  const now = Date.now();
  const tileSet = new Set(tiles);
  // Ways/relations whose centre falls outside the requested tiles are skipped.
  const inTiles = defibs.filter((d) => tileSet.has(tileKeyFor(d)));
  return serialWrite((db) =>
    db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM defibs WHERE source = 'osm' AND tile IN (${placeholders(tiles.length)})`,
        tiles,
      );
      await insertDefibs(db, inTiles, now);
      for (const key of tiles) {
        await db.runAsync('INSERT OR REPLACE INTO tiles (key, fetched_at) VALUES (?, ?)', [key, now]);
      }
    }),
  );
}

export function upsertDefibs(defibs: Defibrillator[]): Promise<void> {
  if (defibs.length === 0) return Promise.resolve();
  return serialWrite((db) => db.withTransactionAsync(() => insertDefibs(db, defibs, Date.now())));
}

function rowsToDefibs(rows: { data: string }[]): Defibrillator[] {
  const out: Defibrillator[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as Defibrillator);
    } catch {
      // ignore corrupt rows
    }
  }
  return out;
}

export async function getDefibsForTiles(keys: string[]): Promise<Defibrillator[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM defibs WHERE tile IN (${placeholders(keys.length)})`,
    keys,
  );
  return rowsToDefibs(rows);
}

export async function getDefibsInBounds(b: Bounds): Promise<Defibrillator[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    'SELECT data FROM defibs WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
    [b.south, b.north, b.west, b.east],
  );
  return rowsToDefibs(rows);
}

/** Every stored record from the given sources (e.g. community submissions for the startup load). */
export async function getDefibsBySource(sources: string[]): Promise<Defibrillator[]> {
  if (sources.length === 0) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM defibs WHERE source IN (${placeholders(sources.length)})`,
    sources,
  );
  return rowsToDefibs(rows);
}

export async function getDefibById(id: string): Promise<Defibrillator | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM defibs WHERE id = ?', [id]);
  return row ? rowsToDefibs([row])[0] ?? null : null;
}

export function clearDownloadedData(): Promise<void> {
  return serialWrite((db) => db.execAsync("DELETE FROM defibs WHERE source = 'osm'; DELETE FROM tiles; DELETE FROM w3w;"));
}

/* ---------------- submissions ---------------- */

export interface SubmissionRow {
  id: string;
  defib: Defibrillator;
  photoLocalUri: string | null;
  syncStatus: SyncStatus;
  lastError: string | null;
  createdAt: number;
}

export function addSubmission(defib: Defibrillator, photoLocalUri: string | null): Promise<void> {
  return serialWrite((db) =>
    db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT OR REPLACE INTO submissions (id, data, photo_local_uri, sync_status, last_error, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
        [defib.id, JSON.stringify(defib), photoLocalUri, 'pending', defib.createdAt ?? Date.now()],
      );
      await insertDefibs(db, [defib], Date.now());
    }),
  );
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    data: string;
    photo_local_uri: string | null;
    sync_status: SyncStatus;
    last_error: string | null;
    created_at: number;
  }>('SELECT * FROM submissions ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    defib: JSON.parse(r.data) as Defibrillator,
    photoLocalUri: r.photo_local_uri,
    syncStatus: r.sync_status,
    lastError: r.last_error,
    createdAt: r.created_at,
  }));
}

export function updateSubmission(
  id: string,
  patch: { syncStatus: SyncStatus; lastError?: string | null; defib?: Defibrillator },
): Promise<void> {
  return serialWrite((db) =>
    db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE submissions SET sync_status = ?, last_error = ? WHERE id = ?', [
        patch.syncStatus,
        patch.lastError ?? null,
        id,
      ]);
      if (patch.defib) {
        const d = { ...patch.defib, syncStatus: patch.syncStatus };
        await db.runAsync('UPDATE submissions SET data = ? WHERE id = ?', [JSON.stringify(d), id]);
        await db.runAsync('UPDATE defibs SET data = ?, updated_at = ? WHERE id = ?', [JSON.stringify(d), Date.now(), id]);
      }
    }),
  );
}

/* ---------------- what3words cache ---------------- */

export async function getCachedWords(id: string, lat: number, lng: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ words: string; lat: number; lng: number }>(
    'SELECT words, lat, lng FROM w3w WHERE id = ?',
    [id],
  );
  if (!row) return null;
  // Invalidate if the defibrillator has been moved since.
  if (Math.abs(row.lat - lat) > 1e-6 || Math.abs(row.lng - lng) > 1e-6) return null;
  return row.words;
}

export function setCachedWords(id: string, lat: number, lng: number, words: string): Promise<void> {
  return serialWrite(async (db) => {
    await db.runAsync('INSERT OR REPLACE INTO w3w (id, words, lat, lng) VALUES (?, ?, ?, ?)', [id, words, lat, lng]);
  });
}
