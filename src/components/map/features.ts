import type { AvailabilityStatus, Defibrillator, DefibSource } from '../../lib/types';

export interface AedFeatureProps {
  id: string;
  s: AvailabilityStatus;
  src: DefibSource;
}

export type AedFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, AedFeatureProps>;

export interface QuickFilters {
  /** Only units usable right now. */
  openNow: boolean;
  /** Only units open around the clock (stated 24/7, or an outdoor cabinet with no hours). */
  allDay: boolean;
  /** Hide locked cabinets whose code is not known. */
  noCode: boolean;
}

export const NO_QUICK_FILTERS: QuickFilters = { openNow: false, allDay: false, noCode: false };

export interface FeatureOptions {
  showClosed: boolean;
  showUnknown: boolean;
  showRestricted: boolean;
  quick: QuickFilters;
}

export function isAllDay(d: Defibrillator): boolean {
  const h = d.openingHours?.trim();
  if (h) return /^24\/7$/.test(h);
  return d.indoor === false;
}

export function passesFilters(d: Defibrillator, s: AvailabilityStatus, o: FeatureOptions): boolean {
  if (s === 'closed' && !o.showClosed) return false;
  if (s === 'restricted' && !o.showRestricted) return false;
  if (s === 'unknown' && !o.showUnknown) return false;
  if (o.quick.openNow && s !== 'available') return false;
  if (o.quick.allDay && !isAllDay(d)) return false;
  if (o.quick.noCode && d.locked === true && !d.pinCode) return false;
  return true;
}

/** GeoJSON for the map's clustered marker source. */
export function buildFeatures(
  all: Defibrillator[],
  statusOf: (d: Defibrillator) => AvailabilityStatus,
  o: FeatureOptions,
): AedFeatureCollection {
  const features: AedFeatureCollection['features'] = [];
  for (const d of all) {
    const s = statusOf(d);
    if (!passesFilters(d, s, o)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: { id: d.id, s, src: d.source },
    });
  }
  return { type: 'FeatureCollection', features };
}
