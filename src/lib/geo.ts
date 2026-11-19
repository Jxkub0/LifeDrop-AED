import type { LatLng } from './types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance between two points in metres (Haversine formula). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b in degrees, 0–360 (0 = north, 90 = east). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

/** Eight-point compass direction in words, e.g. "north-east". */
export function compassDirection(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return COMPASS[index];
}

/** Average adult walking speed used for estimates (≈ 5 km/h). */
export const WALKING_SPEED_MPS = 1.4;
/** Streets are rarely straight: scale straight-line distance to approximate a walking route. */
export const ROUTE_DETOUR_FACTOR = 1.3;

/** Estimated walking time in whole minutes (minimum 1). */
export function walkingMinutes(straightLineMeters: number): number {
  const seconds = (straightLineMeters * ROUTE_DETOUR_FACTOR) / WALKING_SPEED_MPS;
  return Math.max(1, Math.round(seconds / 60));
}

/** Rough urban driving time (straight line × 1.4, ~25 km/h average including junctions). */
export function drivingMinutes(straightLineMeters: number): number {
  const seconds = (straightLineMeters * 1.4) / 7;
  return Math.max(1, Math.round(seconds / 60));
}

export const METERS_PER_YARD = 0.9144;

export interface FormattedDistance {
  metric: string;
  imperial: string;
  /** e.g. "240 metres (262 yards)" – used for display and speech. */
  both: string;
}

function roundNice(value: number): number {
  if (value < 100) return Math.round(value / 5) * 5 || Math.round(value);
  if (value < 1000) return Math.round(value / 10) * 10;
  return Math.round(value);
}

/** Distance as metres/kilometres plus yards/miles, in plain English. */
export function formatDistance(meters: number): FormattedDistance {
  let metric: string;
  if (meters < 1000) {
    const m = roundNice(meters);
    metric = `${m} ${m === 1 ? 'metre' : 'metres'}`;
  } else {
    metric = `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
  }

  const yards = meters / METERS_PER_YARD;
  let imperial: string;
  if (yards < 1760) {
    const y = roundNice(yards);
    imperial = `${y} ${y === 1 ? 'yard' : 'yards'}`;
  } else {
    const miles = yards / 1760;
    imperial = `${miles.toFixed(miles < 10 ? 1 : 0)} miles`;
  }
  return { metric, imperial, both: `${metric} (${imperial})` };
}

/** Rough bounding box around a point; used for local cache queries. */
export function boundingBox(center: LatLng, radiusMeters: number) {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos(toRad(center.latitude)));
  return {
    south: center.latitude - dLat,
    north: center.latitude + dLat,
    west: center.longitude - dLng,
    east: center.longitude + dLng,
  };
}

/** Approximate bounds of the UK and surrounding waters (incl. Shetland, Scilly, NI). */
export const UK_BOUNDS = { south: 49.8, north: 60.95, west: -8.75, east: 1.9 };

export function isInUK(p: LatLng): boolean {
  return (
    p.latitude >= UK_BOUNDS.south &&
    p.latitude <= UK_BOUNDS.north &&
    p.longitude >= UK_BOUNDS.west &&
    p.longitude <= UK_BOUNDS.east
  );
}
