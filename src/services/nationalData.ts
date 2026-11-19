import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { config } from '../lib/config';
import { decodeSnapshot, encodeSnapshot, isSnapshot, type AedSnapshot } from '../lib/sources/openAedMap';
import type { Defibrillator } from '../lib/types';
import { readJson, writeJson } from './storage';

/**
 * The national defibrillator dataset.
 *
 * Every UK defibrillator on OpenStreetMap is bundled with the app and kept up
 * to date with a single daily download from OpenAEDMap (only re-downloaded when
 * the server says it has changed). This replaces dozens of small area-by-area
 * queries, so the map is full the moment the app opens – even with no signal.
 */

const META_KEY = 'national.meta.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NationalMeta {
  etag: string | null;
  /** When the data on the phone was downloaded (or built, for the bundled copy). */
  updatedAt: number;
  /** When we last asked the server for changes. */
  checkedAt: number;
  count: number;
  origin: 'bundled' | 'downloaded';
}

export interface NationalData {
  defibs: Defibrillator[];
  meta: NationalMeta;
}

function dataDir(): Directory {
  const dir = new Directory(Paths.document, 'data');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const snapshotFile = () => new File(dataDir(), 'aeds-gb.json');

export function getNationalMeta(): NationalMeta | null {
  return readJson<NationalMeta>(META_KEY);
}

async function readBundled(): Promise<AedSnapshot | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require('../../assets/data/aeds-gb.dat'));
    await asset.downloadAsync();
    if (!asset.localUri) return null;
    const parsed: unknown = JSON.parse(await new File(asset.localUri).text());
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readDownloaded(): Promise<AedSnapshot | null> {
  try {
    const f = snapshotFile();
    if (!f.exists) return null;
    const parsed: unknown = JSON.parse(await f.text());
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Load the newest copy on the phone: the last download, or the copy bundled with the app. */
export async function loadNationalData(): Promise<NationalData | null> {
  const meta = getNationalMeta();
  const downloaded = await readDownloaded();
  const bundled = downloaded ? null : await readBundled();
  const snap = downloaded ?? bundled;
  if (!snap) return null;
  const defibs = decodeSnapshot(snap);
  const origin = downloaded ? 'downloaded' : 'bundled';
  const m: NationalMeta = {
    etag: downloaded ? (snap.etag ?? meta?.etag ?? null) : null,
    updatedAt: snap.updatedAt,
    checkedAt: downloaded ? (meta?.checkedAt ?? 0) : 0,
    count: defibs.length,
    origin,
  };
  return { defibs, meta: m };
}

export function nationalDataIsStale(meta: NationalMeta | null): boolean {
  return !meta || Date.now() - meta.checkedAt > DAY_MS;
}

export type RefreshOutcome =
  | { status: 'updated'; data: NationalData }
  | { status: 'not-modified'; meta: NationalMeta }
  | { status: 'error'; message: string };

/**
 * Ask OpenAEDMap for a newer national file. Sends the ETag of the copy we
 * already have so an unchanged file costs a few hundred bytes.
 */
export async function refreshNationalData(current: NationalMeta | null): Promise<RefreshOutcome> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': config.userAgent,
      Accept: 'application/geo+json, application/json',
    };
    if (current?.etag && current.origin === 'downloaded') headers['If-None-Match'] = current.etag;
    const res = await fetch(config.nationalDataUrl, { headers });
    const now = Date.now();
    if (res.status === 304 && current) {
      const meta = { ...current, checkedAt: now };
      writeJson(META_KEY, meta);
      return { status: 'not-modified', meta };
    }
    if (!res.ok) return { status: 'error', message: `Server returned ${res.status}` };
    const json: unknown = await res.json();
    const etag = res.headers.get('etag');
    const snap = encodeSnapshot(json, etag, now);
    if (snap.rows.length < 1000) return { status: 'error', message: 'Download looked incomplete' };
    const file = snapshotFile();
    if (!file.exists) file.create({ intermediates: true });
    await file.write(JSON.stringify(snap));
    const defibs = decodeSnapshot(snap);
    const meta: NationalMeta = { etag, updatedAt: now, checkedAt: now, count: defibs.length, origin: 'downloaded' };
    writeJson(META_KEY, meta);
    return { status: 'updated', data: { defibs, meta } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Remove the downloaded copy (the bundled copy is used again). */
export function clearNationalData(): void {
  try {
    const f = snapshotFile();
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
  writeJson(META_KEY, null);
}
