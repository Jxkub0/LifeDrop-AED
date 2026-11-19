import type { LatLng } from './types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const POSTCODES_API = 'https://api.postcodes.io';

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export interface SearchResult extends LatLng {
  label: string;
  country?: string;
}

/** "sw1a1aa" → "SW1A 1AA". Returns null if it is not a full UK postcode. */
export function normalisePostcode(input: string): string | null {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  if (!FULL_POSTCODE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function isOutcode(input: string): boolean {
  return OUTCODE.test(input.trim());
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<any | null> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  return res.json();
}

/**
 * Search for a UK postcode, postcode district (e.g. "LS1") or place name using
 * postcodes.io (free, no key). Falls back to the device geocoder if provided.
 */
export async function searchLocation(
  query: string,
  opts: {
    fetchImpl?: FetchLike;
    deviceGeocode?: (q: string) => Promise<LatLng | null>;
  } = {},
): Promise<SearchResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const q = query.trim();
  if (!q) return null;

  try {
    const postcode = normalisePostcode(q);
    if (postcode) {
      const json = await getJson(fetchImpl, `${POSTCODES_API}/postcodes/${encodeURIComponent(postcode)}`);
      const r = json?.result;
      if (r && typeof r.latitude === 'number') {
        return { latitude: r.latitude, longitude: r.longitude, label: r.postcode, country: r.country };
      }
    } else if (isOutcode(q)) {
      const json = await getJson(fetchImpl, `${POSTCODES_API}/outcodes/${encodeURIComponent(q.toUpperCase())}`);
      const r = json?.result;
      if (r && typeof r.latitude === 'number') {
        return {
          latitude: r.latitude,
          longitude: r.longitude,
          label: r.outcode,
          country: Array.isArray(r.country) ? r.country[0] : r.country,
        };
      }
    } else {
      const json = await getJson(fetchImpl, `${POSTCODES_API}/places?q=${encodeURIComponent(q)}&limit=5`);
      const results: any[] = Array.isArray(json?.result) ? json.result : [];
      const best = results.find((r) => typeof r.latitude === 'number');
      if (best) {
        const area = best.county_unitary || best.district_borough || best.region;
        return {
          latitude: best.latitude,
          longitude: best.longitude,
          label: area ? `${best.name_1}, ${area}` : best.name_1,
          country: best.country,
        };
      }
    }
  } catch {
    // fall through to the device geocoder
  }

  if (opts.deviceGeocode) {
    const p = await opts.deviceGeocode(q);
    if (p) return { ...p, label: q };
  }
  return null;
}

/** Which UK country a point is in (for bank holidays). Null if unknown/offline. */
export async function lookupCountry(p: LatLng, fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const json = await getJson(
      fetchImpl,
      `${POSTCODES_API}/postcodes?lon=${p.longitude}&lat=${p.latitude}&radius=2000&limit=1`,
    );
    const r = Array.isArray(json?.result) ? json.result[0] : null;
    return typeof r?.country === 'string' ? r.country : null;
  } catch {
    return null;
  }
}

export interface SearchSuggestion {
  key: string;
  label: string;
  sublabel?: string;
  kind: 'postcode' | 'outcode' | 'place';
  /** Known position (places); postcodes are resolved with searchLocation when chosen. */
  point?: LatLng;
  /** Text to resolve with searchLocation if there is no point. */
  query: string;
}

const POSTCODE_PREFIX = /^[A-Z]{1,2}\d/i;

/** As-you-type suggestions: matching postcodes and towns/villages (postcodes.io, no key). */
export async function suggestLocations(query: string, fetchImpl: FetchLike = fetch): Promise<SearchSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const out: SearchSuggestion[] = [];
  try {
    if (POSTCODE_PREFIX.test(q) && q.length <= 8) {
      if (isOutcode(q) && !normalisePostcode(q)) {
        out.push({ key: `o:${q}`, label: q.toUpperCase(), sublabel: 'Postcode district', kind: 'outcode', query: q });
      }
      const json = await getJson(fetchImpl, `${POSTCODES_API}/postcodes/${encodeURIComponent(q)}/autocomplete?limit=6`);
      const list: unknown[] = Array.isArray(json?.result) ? json.result : [];
      for (const pc of list) {
        if (typeof pc === 'string') out.push({ key: `p:${pc}`, label: pc, sublabel: 'Postcode', kind: 'postcode', query: pc });
      }
      if (out.length) return out;
    }
    const json = await getJson(fetchImpl, `${POSTCODES_API}/places?q=${encodeURIComponent(q)}&limit=8`);
    const results: any[] = Array.isArray(json?.result) ? json.result : [];
    const seen = new Set<string>();
    for (const r of results) {
      if (typeof r.latitude !== 'number') continue;
      const area = r.county_unitary || r.district_borough || r.region || r.country;
      const label = String(r.name_1);
      const dedupe = `${label}|${area}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        key: `pl:${r.code ?? dedupe}`,
        label,
        sublabel: [r.local_type, area].filter(Boolean).join(' · '),
        kind: 'place',
        point: { latitude: r.latitude, longitude: r.longitude },
        query: label,
      });
    }
  } catch {
    // offline – no suggestions
  }
  return out;
}

/** A short human name for a point, e.g. "Headingley, Leeds" (for naming offline map areas). */
export async function lookupPlaceName(p: LatLng, fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const json = await getJson(
      fetchImpl,
      `${POSTCODES_API}/postcodes?lon=${p.longitude}&lat=${p.latitude}&radius=2000&limit=1`,
    );
    const r = Array.isArray(json?.result) ? json.result[0] : null;
    if (!r) return null;
    const parts = [r.admin_ward, r.admin_district].filter((x: unknown) => typeof x === 'string' && x);
    return parts.length ? Array.from(new Set(parts)).join(', ') : (r.postcode ?? null);
  } catch {
    return null;
  }
}
