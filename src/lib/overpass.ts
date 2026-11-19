import { buildOverpassQuery, parseOverpassResponse } from './osm';
import type { Defibrillator } from './types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OverpassOptions {
  endpoints: string[];
  userAgent: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** Remembers which mirror answered last so we try it first next time. */
let preferredEndpoint: string | null = null;
/** Client-side throttle so panning the map cannot hammer a volunteer-run server. */
let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();
const MIN_INTERVAL_MS = 1500;

/** Requests start at least MIN_INTERVAL_MS apart, in order. */
function acquireSlot(): Promise<void> {
  const previous = gate;
  let release!: () => void;
  gate = new Promise<void>((r) => (release = r));
  return previous.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    release();
  });
}

export class OverpassError extends Error {}

/**
 * POST a query to the Overpass API, falling back across mirrors on failure,
 * rate limiting (429) or gateway timeouts.
 */
export async function runOverpassQuery(query: string, opts: OverpassOptions): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const endpoints = preferredEndpoint && opts.endpoints.includes(preferredEndpoint)
    ? [preferredEndpoint, ...opts.endpoints.filter((e) => e !== preferredEndpoint)]
    : opts.endpoints;

  await acquireSlot();

  let lastError: unknown = new OverpassError('No Overpass endpoints configured');
  for (const url of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': opts.userAgent,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = new OverpassError(`Overpass ${url} returned HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { remark?: string };
      // Overpass reports query timeouts / memory errors as 200 with a "remark".
      if (typeof json?.remark === 'string' && /runtime error|timed out|out of memory/i.test(json.remark)) {
        lastError = new OverpassError(`Overpass ${url}: ${json.remark}`);
        continue;
      }
      preferredEndpoint = url;
      return json;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Fetch every defibrillator inside the given map tiles. */
export async function fetchDefibsForTiles(tiles: string[], opts: OverpassOptions): Promise<Defibrillator[]> {
  if (tiles.length === 0) return [];
  const json = await runOverpassQuery(buildOverpassQuery(tiles), opts);
  return parseOverpassResponse(json);
}

/** Test helper. */
export function __resetOverpassState() {
  preferredEndpoint = null;
  lastRequestAt = 0;
  gate = Promise.resolve();
}
