import type { Defibrillator, LatLng } from './types';
import { boundingBox } from './geo';

/* ------------------------------------------------------------------ */
/* Tiling – the map is split into ~5.5 km tiles that are fetched and   */
/* cached individually, so panning only downloads what is missing.     */
/* ------------------------------------------------------------------ */

export const TILE_LAT = 0.05;
export const TILE_LNG = 0.08;

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function tileKeyFor(p: LatLng): string {
  return `${Math.floor(p.latitude / TILE_LAT)}:${Math.floor(p.longitude / TILE_LNG)}`;
}

export function tileBounds(key: string): Bounds {
  const [y, x] = key.split(':').map(Number);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    south: r(y * TILE_LAT),
    north: r((y + 1) * TILE_LAT),
    west: r(x * TILE_LNG),
    east: r((x + 1) * TILE_LNG),
  };
}

export function tilesForBounds(b: Bounds, maxTiles = 12): string[] | null {
  const y0 = Math.floor(b.south / TILE_LAT);
  const y1 = Math.floor(b.north / TILE_LAT);
  const x0 = Math.floor(b.west / TILE_LNG);
  const x1 = Math.floor(b.east / TILE_LNG);
  const count = (y1 - y0 + 1) * (x1 - x0 + 1);
  if (count > maxTiles) return null; // zoomed out too far
  const keys: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keys.push(`${y}:${x}`);
  return keys;
}

export function tilesAround(center: LatLng, radiusMeters: number): string[] {
  return tilesForBounds(boundingBox(center, radiusMeters), 400) ?? [];
}

/* ------------------------------------------------------------------ */
/* Overpass query & response mapping                                   */
/* ------------------------------------------------------------------ */

export function buildOverpassQuery(tiles: string[], timeoutSec = 25): string {
  const parts = tiles.map((key) => {
    const b = tileBounds(key);
    return `  nwr["emergency"="defibrillator"](${b.south},${b.west},${b.north},${b.east});`;
  });
  return `[out:json][timeout:${timeoutSec}];\n(\n${parts.join('\n')}\n);\nout center;`;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const YES = new Set(['yes', 'true', '1', 'keypad', 'code', 'combination', 'key']);

function firstTag(tags: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = tags[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Strip the stray quotes some mappers put around free text ("Call 999 for code"). */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^"(.*)"$/, '$1').trim();
  return t ? t : undefined;
}

/** OSM tags the app actually uses – everything else is dropped to save memory. */
export const USED_OSM_TAGS = [
  'name',
  'operator',
  'defibrillator:location',
  'defibrillator:location:en',
  'aed:location',
  'description',
  'opening_hours',
  'access',
  'indoor',
  'locked',
  'lock',
  'defibrillator:lock',
  'cabinet:lock',
  'defibrillator:code',
  'access:code',
  'emergency:phone',
  'phone',
  'contact:phone',
  'level',
  'ref:GB:the_circuit',
  'image',
  'mapillary',
  'panoramax',
  'check_date',
  'survey:date',
] as const;

/**
 * Convert the tags of an OSM `emergency=defibrillator` object into the app's
 * model. Shared by the OpenAEDMap national download and live Overpass queries,
 * so both produce identical records (and the same id for the same object).
 */
export function tagsToDefib(
  osmType: string,
  osmId: number | string,
  lat: number,
  lon: number,
  tags: Record<string, string>,
): Defibrillator | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const indoorTag = tags.indoor?.toLowerCase();
  const lockTag = firstTag(tags, ['defibrillator:lock', 'lock', 'locked', 'cabinet:lock'])?.toLowerCase();
  const access = tags.access?.trim().toLowerCase();
  const image = tags.image?.startsWith('http') ? tags.image : undefined;
  const mapillary = tags.mapillary?.split(';')[0]?.trim();

  return {
    id: `osm:${osmType}/${osmId}`,
    source: 'osm',
    sourceName: 'OpenStreetMap',
    latitude: lat,
    longitude: lon,
    name: clean(firstTag(tags, ['name', 'operator'])),
    operator: clean(tags.operator),
    locationDescription: clean(
      firstTag(tags, ['defibrillator:location', 'defibrillator:location:en', 'aed:location', 'description']),
    ),
    openingHours: tags.opening_hours?.trim() || undefined,
    access: tags.access,
    indoor:
      indoorTag === 'yes' || indoorTag === 'room'
        ? true
        : indoorTag === 'no' || indoorTag === 'outdoor'
          ? false
          : undefined,
    // access=code means "you need a code" – the cabinet is locked.
    locked: lockTag ? YES.has(lockTag) : access === 'code' ? true : undefined,
    pinCode: clean(firstTag(tags, ['defibrillator:code', 'access:code'])),
    phone: firstTag(tags, ['emergency:phone', 'phone', 'contact:phone']),
    level: tags.level,
    circuitRef: tags['ref:GB:the_circuit'],
    photoUrl: image,
    mapillaryId: mapillary && /^\d+$/.test(mapillary) ? mapillary : undefined,
    panoramaxId: tags.panoramax?.split(';')[0]?.trim() || undefined,
    checkDate: firstTag(tags, ['check_date', 'survey:date']),
  };
}

/** Convert one Overpass element into the app's Defibrillator model. */
export function elementToDefib(el: OverpassElement): Defibrillator | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const tags = el.tags ?? {};
  if (tags.emergency !== 'defibrillator') return null;
  return tagsToDefib(el.type, el.id, lat, lon, tags);
}

export function parseOverpassResponse(json: unknown): Defibrillator[] {
  const elements = (json as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) throw new Error('Unexpected Overpass response');
  const out: Defibrillator[] = [];
  for (const el of elements) {
    const d = elementToDefib(el);
    if (d) out.push(d);
  }
  return out;
}
