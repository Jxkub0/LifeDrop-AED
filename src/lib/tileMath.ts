/** Web-Mercator tile helpers used for offline map downloads. */

/** [west, south, east, north] in degrees – the same order MapLibre uses. */
export type LngLatBox = [number, number, number, number];

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

const clampLat = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat));

export function lngToTileX(lng: number, z: number): number {
  const n = 2 ** z;
  return Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)));
}

export function latToTileY(lat: number, z: number): number {
  const n = 2 ** z;
  const r = (clampLat(lat) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
}

export interface TileRange {
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function tileRanges(box: LngLatBox, minZoom: number, maxZoom: number): TileRange[] {
  const [w, s, e, n] = box;
  const out: TileRange[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    out.push({ z, x0: lngToTileX(w, z), x1: lngToTileX(e, z), y0: latToTileY(n, z), y1: latToTileY(s, z) });
  }
  return out;
}

export function countTiles(box: LngLatBox, minZoom: number, maxZoom: number): number {
  return tileRanges(box, minZoom, maxZoom).reduce((sum, r) => sum + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
}

export function* iterateTiles(box: LngLatBox, minZoom: number, maxZoom: number): Generator<TileCoord> {
  for (const r of tileRanges(box, minZoom, maxZoom)) {
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) yield { z: r.z, x, y };
  }
}

/** A square box of `radiusM` metres around a point. */
export function boxAround(lat: number, lng: number, radiusM: number): LngLatBox {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/**
 * Rough download size, from sampling OpenFreeMap tiles across the UK: a
 * street-level tile is ~10 KB in the countryside and 60–250 KB in a city.
 */
export function estimateBytes(box: LngLatBox, minZoom: number, maxZoom: number): number {
  return tileRanges(box, minZoom, maxZoom).reduce((sum, r) => {
    const n = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const per = r.z >= 14 ? 70_000 : r.z >= 12 ? 55_000 : r.z >= 11 ? 70_000 : 90_000;
    return sum + n * per;
  }, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
