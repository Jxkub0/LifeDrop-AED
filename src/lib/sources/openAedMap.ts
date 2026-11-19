import { tagsToDefib, USED_OSM_TAGS } from '../osm';
import type { Defibrillator } from '../types';

/**
 * OpenAEDMap (https://openaedmap.org) publishes every OpenStreetMap
 * defibrillator in a country as one GeoJSON file, refreshed continuously from
 * OSM. Downloading the whole UK once (~1.5 MB compressed) is far faster than
 * querying Overpass area by area, and it means the nearest unit can be found
 * instantly – even offline.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
export const OPENAEDMAP_UK_URL = 'https://openaedmap.org/api/v1/countries/GB.geojson';

interface AedFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
}

/** Parse the OpenAEDMap country GeoJSON into Defibrillator records. */
export function parseOpenAedMap(json: unknown): Defibrillator[] {
  const features = (json as { features?: AedFeature[] })?.features;
  if (!Array.isArray(features)) throw new Error('Unexpected OpenAEDMap response');
  const out: Defibrillator[] = [];
  for (const f of features) {
    const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : undefined;
    const p = f.properties;
    if (!c || !p) continue;
    const tags: Record<string, string> = {};
    for (const k of USED_OSM_TAGS) {
      const v = p[k];
      if (typeof v === 'string' && v) tags[k] = v;
      else if (typeof v === 'number') tags[k] = String(v);
    }
    const d = tagsToDefib(String(p['@osm_type'] ?? 'node'), String(p['@osm_id'] ?? ''), c[1], c[0], tags);
    if (d && p['@osm_id'] != null) out.push(d);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Compact on-device snapshot                                          */
/*                                                                    */
/* The national dataset is stored (and bundled with the app) in a     */
/* compact array format that loads several times faster than GeoJSON: */
/*   { v, etag, updatedAt, tags: [...], rows: [[id, lat, lon,          */
/*     tagIndex, value, tagIndex, value, ...], ...] }                  */
/* Ids are "n123" / "w123" / "r123".                                   */
/* ------------------------------------------------------------------ */

export interface AedSnapshot {
  v: 1;
  etag?: string | null;
  /** When the data was downloaded from OpenAEDMap (epoch ms). */
  updatedAt: number;
  tags: string[];
  rows: (string | number)[][];
}

const TYPE_LETTER: Record<string, string> = { node: 'n', way: 'w', relation: 'r' };
const LETTER_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };

/** Build a snapshot straight from OpenAEDMap GeoJSON (keeps only the tags the app uses). */
export function encodeSnapshot(json: unknown, etag: string | null, updatedAt: number): AedSnapshot {
  const features = (json as { features?: AedFeature[] })?.features;
  if (!Array.isArray(features)) throw new Error('Unexpected OpenAEDMap response');
  const tags = [...USED_OSM_TAGS] as string[];
  const rows: (string | number)[][] = [];
  for (const f of features) {
    const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : undefined;
    const p = f.properties;
    if (!c || !p || p['@osm_id'] == null) continue;
    const letter = TYPE_LETTER[String(p['@osm_type'] ?? 'node')] ?? 'n';
    const row: (string | number)[] = [
      `${letter}${p['@osm_id']}`,
      Math.round(c[1] * 1e6) / 1e6,
      Math.round(c[0] * 1e6) / 1e6,
    ];
    tags.forEach((k, i) => {
      const v = p[k];
      if ((typeof v === 'string' && v) || typeof v === 'number') row.push(i, String(v));
    });
    rows.push(row);
  }
  return { v: 1, etag, updatedAt, tags, rows };
}

export function isSnapshot(x: unknown): x is AedSnapshot {
  const s = x as AedSnapshot;
  return !!s && s.v === 1 && Array.isArray(s.tags) && Array.isArray(s.rows);
}

/** Expand a snapshot into Defibrillator records. */
export function decodeSnapshot(snap: AedSnapshot): Defibrillator[] {
  const out: Defibrillator[] = [];
  for (const row of snap.rows) {
    const id = String(row[0]);
    const type = LETTER_TYPE[id[0]] ?? 'node';
    const tags: Record<string, string> = {};
    for (let i = 3; i + 1 < row.length; i += 2) {
      const key = snap.tags[row[i] as number];
      if (key) tags[key] = String(row[i + 1]);
    }
    const d = tagsToDefib(type, id.slice(1), Number(row[1]), Number(row[2]), tags);
    if (d) out.push(d);
  }
  return out;
}
