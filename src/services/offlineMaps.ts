import { Directory, File, Paths } from 'expo-file-system';
import { config } from '../lib/config';
import { OPENFREEMAP, safeFontName, type OfflineRefs } from '../lib/mapStyles';
import { countTiles, iterateTiles, tileRanges, type LngLatBox, type TileCoord } from '../lib/tileMath';
import { readJson, writeJson } from './storage';

/**
 * Offline maps.
 *
 * Map tiles for an area are saved as plain files and drawn from the phone
 * when there is no signal (or when the user prefers saved maps). Downloads
 * follow OpenFreeMap's fair-use rules for offline use: at most 4 requests at a
 * time, an identifying User-Agent, and no more than 3,000 tiles / 50 MB per
 * download. Satellite imagery cannot be saved for offline use.
 */

const MANIFEST_KEY = 'offline.areas.v1';
export const MAX_TILES_PER_DOWNLOAD = 3000;
export const MAX_BYTES_PER_DOWNLOAD = 50 * 1024 * 1024;
const PARALLEL = 4;
export const OFFLINE_MAX_ZOOM = OPENFREEMAP.maxzoom; // the map can zoom further – z14 tiles are over-zoomed
export const OFFLINE_MIN_ZOOM = 0;

export interface OfflineArea {
  id: string;
  name: string;
  box: LngLatBox;
  minZoom: number;
  maxZoom: number;
  tiles: number;
  bytes: number;
  failed: number;
  createdAt: number;
  status: 'complete' | 'partial';
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
  phase: 'preparing' | 'tiles' | 'finishing';
}

const root = () => new Directory(Paths.document, 'offline-maps');

function ensureDir(...parts: string[]): Directory {
  const dir = new Directory(root(), ...parts);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const withSlash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`);

export function listAreas(): OfflineArea[] {
  return readJson<OfflineArea[]>(MANIFEST_KEY) ?? [];
}

const listeners = new Set<() => void>();
let version = 0;

/** For useSyncExternalStore: re-render when areas are added or removed. */
export function subscribeAreas(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function areasVersion(): number {
  return version;
}

function saveAreas(areas: OfflineArea[]) {
  writeJson(MANIFEST_KEY, areas);
  version++;
  listeners.forEach((fn) => fn());
}

export function hasOfflineMaps(): boolean {
  return listAreas().length > 0;
}

export function fontMap(): Record<string, string> {
  return Object.fromEntries(OPENFREEMAP.fonts.map((f) => [f, safeFontName(f)]));
}

/** file:// locations to plug into the offline map style. */
export function offlineRefs(): OfflineRefs | null {
  if (!hasOfflineMaps()) return null;
  const base = withSlash(root().uri);
  return {
    tiles: `${base}tiles/{z}/{x}/{y}.pbf`,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}sprites/ofm`,
    fontMap: fontMap(),
  };
}

/** Is a point inside any downloaded area? */
export function isCoveredOffline(lat: number, lng: number): boolean {
  return listAreas().some(({ box: [w, s, e, n] }) => lat >= s && lat <= n && lng >= w && lng <= e);
}

const headers = () => ({ 'User-Agent': config.userAgent });

async function download(url: string, dest: File, signal?: AbortSignal): Promise<number> {
  if (dest.exists) dest.delete();
  const f = await File.downloadFileAsync(url, dest, { headers: headers(), idempotent: true, signal });
  return f.size ?? 0;
}

/** Fonts and map symbols – shared by every area, downloaded once. */
async function ensureStyleAssets(signal?: AbortSignal): Promise<number> {
  let bytes = 0;
  const sprites = ensureDir('sprites');
  for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
    const f = new File(sprites, `ofm${suffix}`);
    if (!f.exists || !f.size) bytes += await download(`${OPENFREEMAP.sprite}${suffix}`, f, signal);
  }
  for (const font of OPENFREEMAP.fonts) {
    const dir = ensureDir('fonts', safeFontName(font));
    for (const range of OPENFREEMAP.glyphRanges) {
      const f = new File(dir, `${range}.pbf`);
      if (!f.exists || !f.size) {
        const url = OPENFREEMAP.glyphs.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range);
        bytes += await download(url, f, signal);
      }
    }
  }
  return bytes;
}

/** The current OpenFreeMap tile URL template (it changes with each weekly planet build). */
async function tileTemplate(): Promise<string> {
  const res = await fetch(OPENFREEMAP.tilejson, { headers: headers() });
  if (!res.ok) throw new Error(`Map server returned ${res.status}`);
  const json = (await res.json()) as { tiles?: string[] };
  const t = json.tiles?.[0];
  if (!t) throw new Error('Map server did not list any tiles');
  return t;
}

const tileFile = (t: TileCoord) => new File(root(), 'tiles', String(t.z), String(t.x), `${t.y}.pbf`);

export interface DownloadRequest {
  name: string;
  box: LngLatBox;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Download an area. Tiles already saved by another area are reused. Stops
 * early (and keeps what it has) if the 50 MB fair-use limit is reached.
 */
export async function downloadArea(
  req: DownloadRequest,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<OfflineArea> {
  const minZoom = req.minZoom ?? OFFLINE_MIN_ZOOM;
  const maxZoom = req.maxZoom ?? OFFLINE_MAX_ZOOM;
  const total = countTiles(req.box, minZoom, maxZoom);
  if (total > MAX_TILES_PER_DOWNLOAD) {
    throw new Error(`That area needs ${total.toLocaleString()} map tiles – the limit is ${MAX_TILES_PER_DOWNLOAD.toLocaleString()}. Choose a smaller area.`);
  }
  onProgress({ done: 0, total, bytes: 0, phase: 'preparing' });
  const template = await tileTemplate();
  let bytes = await ensureStyleAssets(signal);

  const queue = Array.from(iterateTiles(req.box, minZoom, maxZoom));
  let done = 0;
  let failed = 0;
  let stopped = false;
  const madeDirs = new Set<string>();

  const worker = async () => {
    while (queue.length && !stopped) {
      if (signal?.aborted) throw new Error('Download cancelled');
      const t = queue.shift()!;
      const file = tileFile(t);
      if (!file.exists || !file.size) {
        const key = `${t.z}/${t.x}`;
        if (!madeDirs.has(key)) {
          ensureDir('tiles', String(t.z), String(t.x));
          madeDirs.add(key);
        }
        try {
          bytes += await download(
            template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)),
            file,
            signal,
          );
        } catch (e) {
          if (signal?.aborted) throw e;
          failed++;
        }
        if (bytes > MAX_BYTES_PER_DOWNLOAD) stopped = true;
      }
      done++;
      if (done % 5 === 0 || done === total) onProgress({ done, total, bytes, phase: 'tiles' });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  onProgress({ done, total, bytes, phase: 'finishing' });

  const area: OfflineArea = {
    id: `${Date.now().toString(36)}`,
    name: req.name,
    box: req.box,
    minZoom,
    maxZoom,
    tiles: done,
    bytes,
    failed,
    createdAt: Date.now(),
    status: stopped || failed > total * 0.05 ? 'partial' : 'complete',
  };
  saveAreas([...listAreas(), area]);
  return area;
}

function areaHasTile(a: OfflineArea, t: TileCoord): boolean {
  if (t.z < a.minZoom || t.z > a.maxZoom) return false;
  const r = tileRanges(a.box, t.z, t.z)[0];
  return t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1;
}

/** Delete an area, keeping any tiles another saved area still needs. */
export function deleteArea(id: string): void {
  const areas = listAreas();
  const area = areas.find((a) => a.id === id);
  const rest = areas.filter((a) => a.id !== id);
  saveAreas(rest);
  if (!area) return;
  if (!rest.length) {
    try {
      const dir = root();
      if (dir.exists) dir.delete();
    } catch {
      // ignore
    }
    return;
  }
  for (const t of iterateTiles(area.box, area.minZoom, area.maxZoom)) {
    if (rest.some((a) => areaHasTile(a, t))) continue;
    try {
      const f = tileFile(t);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
}

export function renameArea(id: string, name: string): void {
  saveAreas(listAreas().map((a) => (a.id === id ? { ...a, name } : a)));
}

/** Total space used by saved maps. */
export function offlineBytes(): number {
  try {
    const dir = root();
    return dir.exists ? (dir.size ?? 0) : 0;
  } catch {
    return listAreas().reduce((s, a) => s + a.bytes, 0);
  }
}
