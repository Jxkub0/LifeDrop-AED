import Storage from 'expo-sqlite/kv-store';
import { BUNDLED_BANK_HOLIDAYS } from '../lib/bankHolidaysData';
import { parseGovUkHolidays, type HolidayTable, type UKRegion } from '../lib/holidays';

/** Small synchronous key-value helpers (SQLite-backed AsyncStorage replacement). */
export function readJson<T>(key: string): T | null {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  Storage.setItemAsync(key, JSON.stringify(value)).catch(() => undefined);
}

/* ---------------- bank holidays ---------------- */

const HOLIDAYS_KEY = 'bankHolidays.v1';
const REGION_KEY = 'region.v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function loadHolidayTable(): HolidayTable {
  return readJson<{ table: HolidayTable }>(HOLIDAYS_KEY)?.table ?? BUNDLED_BANK_HOLIDAYS;
}

/** Download the latest bank holiday list from gov.uk at most once a week. */
export async function refreshHolidayTable(): Promise<HolidayTable | null> {
  const cached = readJson<{ fetchedAt: number; table: HolidayTable }>(HOLIDAYS_KEY);
  if (cached && Date.now() - cached.fetchedAt < WEEK_MS) return null;
  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json');
    if (!res.ok) return null;
    const table = parseGovUkHolidays(await res.json());
    if (!table) return null;
    writeJson(HOLIDAYS_KEY, { fetchedAt: Date.now(), table });
    return table;
  } catch {
    return null;
  }
}

export function loadRegion(): UKRegion | null {
  return readJson<UKRegion>(REGION_KEY);
}

export function saveRegion(region: UKRegion): void {
  writeJson(REGION_KEY, region);
}
