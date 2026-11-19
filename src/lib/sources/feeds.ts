import { isInUK } from '../geo';
import type { Defibrillator } from '../types';
import { osgbToWgs84 } from './osgb';

/**
 * Open-data feeds: council datasets and any GeoJSON / CSV list of
 * defibrillators the user adds in Settings. Column names vary wildly between
 * publishers, so fields are matched by a set of common names.
 */

export type FeedFormat = 'auto' | 'geojson' | 'csv';

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  format: FeedFormat;
  /** Licence / attribution line shown in the app. */
  licence?: string;
  /** Web page describing the dataset. */
  homepage?: string;
  /** Shipped with the app (can be switched off but not deleted). */
  builtIn?: boolean;
  /** Short note such as "Council buildings, January 2019". */
  note?: string;
}

/** Open datasets published by UK councils under the Open Government Licence. */
export const BUILT_IN_FEEDS: FeedConfig[] = [
  {
    id: 'leeds',
    name: 'Leeds City Council',
    url: 'https://datamillnorth.org/download/e51nn/a2bcc94c-1d27-4f69-bcc2-ec6f19497aad/Copy%20of%20Copy%20of%20Defib%20List%20Jan%202019.csv',
    format: 'csv',
    licence: 'Contains public sector information licensed under the Open Government Licence v3.0 (Leeds City Council).',
    homepage: 'https://datamillnorth.org/dataset/e51nn',
    builtIn: true,
    note: 'Council buildings – published January 2019',
  },
  {
    id: 'trafford',
    name: 'Trafford Council',
    url: 'https://www.trafforddatalab.io/open_data/defibrillators/trafford_defibrillators.geojson',
    format: 'geojson',
    licence: 'Contains public sector information licensed under the Open Government Licence (Trafford Council).',
    homepage: 'https://www.data.gov.uk/dataset/6f38b81c-7985-4651-93b4-d67a695cdde4/defibrillators-in-trafford',
    builtIn: true,
    note: 'Schools and public buildings – published 2018',
  },
  {
    id: 'runnymede',
    name: 'Runnymede Borough Council',
    url: 'https://maps.runnymede.gov.uk/geoserver/community/public_access_defibrillators/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=community:public_access_defibrillators&outputFormat=application/json&srsName=EPSG:4326',
    format: 'geojson',
    licence: 'Runnymede Borough Council public access defibrillators (council open data).',
    homepage: 'https://www.data.gov.uk/search?q=runnymede+defibrillators',
    builtIn: true,
    note: 'Public access defibrillators',
  },
];

/* ---------------- field matching ---------------- */

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const NAME_KEYS = ['name', 'sitename', 'site', 'location', 'locationname', 'title', 'building', 'premises', 'venue', 'place', 'buildingname', 'organisation'];
const WHERE_KEYS = ['locationwithinbuilding', 'defibrillatorlocation', 'position', 'whereis', 'exactlocation', 'locationdetails', 'aedlocation', 'description', 'details', 'notes', 'comments'];
const ADDRESS_KEYS = ['address', 'address1', 'addressline1', 'street', 'address2', 'addressline2', 'address3', 'addressline3', 'town', 'address4', 'addressline4', 'postcode', 'postalcode'];
const HOURS_KEYS = ['openinghours', 'hours', 'availability', 'available', 'accesshours', 'times'];
const ACCESS_KEYS = ['access', 'publicaccess', 'accesstype', 'public'];
const LOCK_KEYS = ['locked', 'cabinet', 'cabinettype', 'lock', 'keypad', 'code'];
const PHONE_KEYS = ['phone', 'telephone', 'contactnumber', 'tel'];
const LAT_KEYS = ['latitude', 'lat', 'wgs84latitude', 'y'];
const LON_KEYS = ['longitude', 'lon', 'lng', 'long', 'wgs84longitude', 'x'];
const EAST_KEYS = ['easting', 'eastings', 'xcoordinate', 'osgbeasting'];
const NORTH_KEYS = ['northing', 'northings', 'ycoordinate', 'osgbnorthing'];

type Row = Record<string, string>;

function pick(row: Row, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

function pickAll(row: Row, keys: string[]): string | undefined {
  const parts: string[] = [];
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v && !parts.includes(v)) parts.push(v);
  }
  return parts.length ? parts.join(', ') : undefined;
}

function normaliseRow(props: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null || typeof v === 'object') continue;
    const key = norm(k);
    if (!(key in row)) row[key] = String(v);
  }
  return row;
}

const TRUE_WORDS = /^(yes|y|true|1|24\/7|24 ?hrs?|24 ?hours?)$/i;

function hoursFrom(row: Row): string | undefined {
  const raw = pick(row, HOURS_KEYS);
  const flag = pick(row, ['24hr', '24hrs', '24hour', '24hours', 'available247', 'access247', 'open247']);
  if (flag && TRUE_WORDS.test(flag)) return '24/7';
  if (!raw) return undefined;
  if (/24\s*\/\s*7|24\s*hours?|24\s*hrs?|always/i.test(raw)) return '24/7';
  return raw;
}

function rowToDefib(feed: FeedConfig, row: Row, lat: number, lon: number): Defibrillator | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!isInUK({ latitude: lat, longitude: lon })) return null;
  const accessRaw = pick(row, ACCESS_KEYS)?.toLowerCase();
  const access =
    accessRaw && /private|staff|restricted|no\b/.test(accessRaw)
      ? 'private'
      : accessRaw && /public|yes|true/.test(accessRaw)
        ? 'yes'
        : undefined;
  const lockRaw = pick(row, LOCK_KEYS)?.toLowerCase();
  const name = pick(row, NAME_KEYS);
  const where = pick(row, WHERE_KEYS);
  const address = pickAll(row, ADDRESS_KEYS);
  const indoorHint = `${where ?? ''} ${name ?? ''}`.toLowerCase();
  return {
    id: `feed:${feed.id}/${lat.toFixed(5)},${lon.toFixed(5)}`,
    source: 'feed',
    sourceName: feed.name,
    latitude: lat,
    longitude: lon,
    name,
    locationDescription: where && where !== name ? where : undefined,
    address: address && address !== name ? address : undefined,
    openingHours: hoursFrom(row),
    access,
    locked: lockRaw ? /lock|keypad|code|yes|true/.test(lockRaw) && !/unlock|no\b/.test(lockRaw) : undefined,
    phone: pick(row, PHONE_KEYS),
    indoor: /reception|inside|office|poolside|foyer|corridor|room|hall\b/.test(indoorHint)
      ? true
      : /outside|external|exterior|cabinet|wall/.test(indoorHint)
        ? false
        : undefined,
  };
}

function coordsFromRow(row: Row): { lat: number; lon: number } | null {
  const lat = parseFloat(pick(row, LAT_KEYS) ?? '');
  const lon = parseFloat(pick(row, LON_KEYS) ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    // Some publishers swap the columns.
    if (lat > -10 && lat < 3 && lon > 49 && lon < 61) return { lat: lon, lon: lat };
    return { lat, lon };
  }
  const e = parseFloat(pick(row, EAST_KEYS) ?? (Number.isFinite(lon) ? String(lon) : ''));
  const n = parseFloat(pick(row, NORTH_KEYS) ?? (Number.isFinite(lat) ? String(lat) : ''));
  if (Number.isFinite(e) && Number.isFinite(n) && e > 0 && e < 800000 && n > 0 && n < 1300000) {
    const p = osgbToWgs84(e, n);
    return { lat: p.latitude, lon: p.longitude };
  }
  return null;
}

/* ---------------- GeoJSON ---------------- */

interface GeoFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

export function parseGeoJsonFeed(feed: FeedConfig, json: unknown): Defibrillator[] {
  const fc = json as { type?: string; features?: GeoFeature[] };
  const features = Array.isArray(fc?.features) ? fc.features : Array.isArray(json) ? (json as GeoFeature[]) : null;
  if (!features) throw new Error('Not a GeoJSON FeatureCollection');
  const out: Defibrillator[] = [];
  for (const f of features) {
    const g = f.geometry;
    let c: number[] | undefined;
    if (g?.type === 'Point') c = g.coordinates as number[];
    else if (g?.type === 'MultiPoint') c = (g.coordinates as number[][])?.[0];
    const row = normaliseRow(f.properties ?? {});
    let lat: number | undefined;
    let lon: number | undefined;
    if (c && c.length >= 2) {
      if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
        const p = osgbToWgs84(c[0], c[1]); // British National Grid coordinates
        lat = p.latitude;
        lon = p.longitude;
      } else {
        lat = c[1];
        lon = c[0];
      }
    } else {
      const p = coordsFromRow(row);
      if (p) {
        lat = p.lat;
        lon = p.lon;
      }
    }
    if (lat == null || lon == null) continue;
    const d = rowToDefib(feed, row, lat, lon);
    if (d) out.push(d);
  }
  return dedupeIds(out);
}

/* ---------------- CSV ---------------- */

/** RFC 4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export function parseCsvFeed(feed: FeedConfig, text: string): Defibrillator[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV has no data rows');
  const header = rows[0].map(norm);
  const out: Defibrillator[] = [];
  for (const r of rows.slice(1)) {
    const row: Row = {};
    header.forEach((h, i) => {
      if (h && !(h in row)) row[h] = r[i] ?? '';
    });
    const p = coordsFromRow(row);
    if (!p) continue;
    const d = rowToDefib(feed, row, p.lat, p.lon);
    if (d) out.push(d);
  }
  if (!out.length) throw new Error('No rows with latitude/longitude (or easting/northing) columns');
  return dedupeIds(out);
}

/** Parse a downloaded feed body, detecting the format when set to "auto". */
export function parseFeed(feed: FeedConfig, body: string): Defibrillator[] {
  const trimmed = body.trimStart();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (feed.format === 'geojson' || (feed.format === 'auto' && looksJson)) {
    return parseGeoJsonFeed(feed, JSON.parse(body));
  }
  return parseCsvFeed(feed, body);
}

function dedupeIds(list: Defibrillator[]): Defibrillator[] {
  const seen = new Set<string>();
  return list.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}
