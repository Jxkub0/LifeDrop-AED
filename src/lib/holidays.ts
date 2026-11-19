import { BUNDLED_BANK_HOLIDAYS } from './bankHolidaysData';
import type { LatLng } from './types';

/** gov.uk bank holiday "divisions". */
export type UKRegion = 'england-and-wales' | 'scotland' | 'northern-ireland';

export type HolidayTable = Record<string, string[]>;

/** Map a postcodes.io `country` value to a bank holiday division. */
export function regionFromCountry(country: string | undefined | null): UKRegion | null {
  switch ((country ?? '').toLowerCase()) {
    case 'england':
    case 'wales':
      return 'england-and-wales';
    case 'scotland':
      return 'scotland';
    case 'northern ireland':
      return 'northern-ireland';
    default:
      return null;
  }
}

/**
 * Offline best guess of the region from coordinates. Only used when the
 * postcode lookup is unavailable – the border areas are approximate.
 */
export function guessRegion(p: LatLng): UKRegion {
  const { latitude: lat, longitude: lng } = p;
  if (lng < -5.35 && lat > 53.95 && lat < 55.45) return 'northern-ireland';
  if (lat >= 55.8 || (lat >= 55.0 && lng < -2.2)) return 'scotland';
  return 'england-and-wales';
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build a holiday lookup for the given region. Returns null for dates outside
 * the range covered by the data so the opening-hours engine can report "unknown"
 * for PH rules rather than guessing.
 */
export function makeHolidayLookup(region: UKRegion, table: HolidayTable = BUNDLED_BANK_HOLIDAYS) {
  const dates = new Set(table[region] ?? []);
  const sorted = [...dates].sort();
  const first = sorted[0];
  const lastYear = sorted.length ? Number(sorted[sorted.length - 1].slice(0, 4)) : 0;
  return (date: Date): boolean | null => {
    const key = isoDate(date);
    if (dates.has(key)) return true;
    if (!first || key < first || date.getFullYear() > lastYear) return null;
    return false;
  };
}

/** Parse the gov.uk bank-holidays.json payload into a compact table. */
export function parseGovUkHolidays(json: unknown): HolidayTable | null {
  if (!json || typeof json !== 'object') return null;
  const out: HolidayTable = {};
  for (const region of ['england-and-wales', 'scotland', 'northern-ireland'] as const) {
    const events = (json as Record<string, { events?: { date?: string }[] }>)[region]?.events;
    if (!Array.isArray(events)) return null;
    out[region] = events.map((e) => e.date).filter((d): d is string => typeof d === 'string');
  }
  return out;
}
