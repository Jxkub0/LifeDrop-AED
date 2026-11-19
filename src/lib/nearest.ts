import { evaluateAvailability } from './availability';
import { bearingDegrees, boundingBox, haversineMeters } from './geo';
import type { Defibrillator, DefibWithMeta, LatLng } from './types';

export type HolidayLookup = (d: Date) => boolean | null;

/** Attach availability (and distance/bearing if a reference point is given). */
export function annotate(
  defib: Defibrillator,
  now: Date,
  holidayLookup: HolidayLookup,
  from?: LatLng | null,
): DefibWithMeta {
  const availability = evaluateAvailability(defib, now, holidayLookup);
  if (!from) return { ...defib, availability };
  return {
    ...defib,
    availability,
    distanceM: haversineMeters(from, defib),
    bearingDeg: bearingDegrees(from, defib),
  };
}

export interface NearestResult {
  /** Closest unit that is available now (or, if none, the closest with unconfirmed hours). */
  best: DefibWithMeta | null;
  /** True when no confirmed-available unit was found and `best` has unconfirmed hours. */
  usedUnconfirmed: boolean;
  /** A much closer unit whose hours are unconfirmed – worth knowing about in an emergency. */
  closerUnconfirmed?: DefibWithMeta;
  /** How many units were considered. */
  searched: number;
}

/**
 * "Find closest available": drop closed and restricted units, measure the
 * Haversine distance to every remaining unit and pick the nearest.
 */
export function findNearestAvailable(
  defibs: Defibrillator[],
  from: LatLng,
  now: Date,
  holidayLookup: HolidayLookup,
  maxDistanceM: number,
): NearestResult {
  // Cheap bounding-box test first: the national dataset has tens of thousands of entries.
  const box = boundingBox(from, maxDistanceM);
  const annotated = defibs
    .filter((d) => d.latitude >= box.south && d.latitude <= box.north && d.longitude >= box.west && d.longitude <= box.east)
    .map((d) => annotate(d, now, holidayLookup, from))
    .filter((d) => (d.distanceM ?? Infinity) <= maxDistanceM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));

  const available = annotated.filter((d) => d.availability.status === 'available');
  const unknown = annotated.filter((d) => d.availability.status === 'unknown');

  const best = available[0];
  if (best) {
    const nearUnknown = unknown[0];
    const closerUnconfirmed =
      nearUnknown &&
      nearUnknown.distanceM! < best.distanceM! * 0.5 &&
      best.distanceM! - nearUnknown.distanceM! > 150
        ? nearUnknown
        : undefined;
    return { best, usedUnconfirmed: false, closerUnconfirmed, searched: annotated.length };
  }
  if (unknown[0]) return { best: unknown[0], usedUnconfirmed: true, searched: annotated.length };
  return { best: null, usedUnconfirmed: false, searched: annotated.length };
}

/** Units within `radiusM` of a point, nearest first (bounding-box filtered, so fast on big datasets). */
export function nearbyDefibs(
  defibs: Iterable<Defibrillator>,
  from: LatLng,
  now: Date,
  holidayLookup: HolidayLookup,
  radiusM: number,
  limit = 100,
): DefibWithMeta[] {
  const box = boundingBox(from, radiusM);
  const out: DefibWithMeta[] = [];
  for (const d of defibs) {
    if (d.latitude < box.south || d.latitude > box.north || d.longitude < box.west || d.longitude > box.east) continue;
    const a = annotate(d, now, holidayLookup, from);
    if ((a.distanceM ?? Infinity) <= radiusM) out.push(a);
  }
  out.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  return out.slice(0, limit);
}
