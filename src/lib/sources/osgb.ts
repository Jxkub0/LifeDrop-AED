/**
 * Convert Ordnance Survey National Grid eastings/northings (EPSG:27700) to
 * WGS84 latitude/longitude. Many UK council datasets only publish grid
 * references. Accuracy is ~5 m (Helmert transform), plenty for finding a
 * defibrillator on a map.
 */

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export function osgbToWgs84(easting: number, northing: number): { latitude: number; longitude: number } {
  // Airy 1830 ellipsoid, National Grid projection constants
  const a = 6377563.396;
  const b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = rad(49);
  const lon0 = rad(-2);
  const N0 = -100000;
  const E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let lat = lat0;
  let M = 0;
  do {
    lat = (northing - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * (lat - lat0);
    const Mb = (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    const Mc = ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    const Md = (35 / 24) * n ** 3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(northing - N0 - M) >= 0.00001);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const tanLat = Math.tan(lat);
  const tan2 = tanLat ** 2;
  const tan4 = tan2 ** 2;
  const tan6 = tan4 * tan2;
  const secLat = 1 / cosLat;
  const VII = tanLat / (2 * rho * nu);
  const VIII = (tanLat / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX = (tanLat / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan4);
  const X = secLat / nu;
  const XI = (secLat / (6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const XII = (secLat / (120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan4);
  const XIIA = (secLat / (5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
  const dE = easting - E0;
  const latOsgb = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const lonOsgb = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;

  // OSGB36 → cartesian
  const sinP = Math.sin(latOsgb);
  const nuA = a / Math.sqrt(1 - e2 * sinP * sinP);
  const x1 = nuA * Math.cos(latOsgb) * Math.cos(lonOsgb);
  const y1 = nuA * Math.cos(latOsgb) * Math.sin(lonOsgb);
  const z1 = nuA * (1 - e2) * sinP;

  // Helmert transform OSGB36 → WGS84
  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = 20.4894e-6;
  const rx = rad(0.1502 / 3600);
  const ry = rad(0.247 / 3600);
  const rz = rad(0.8421 / 3600);
  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;

  // cartesian → WGS84 lat/lon
  const aW = 6378137;
  const bW = 6356752.3142;
  const e2W = 1 - (bW * bW) / (aW * aW);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let phi = Math.atan2(z2, p * (1 - e2W));
  for (let i = 0; i < 10; i++) {
    const nuW = aW / Math.sqrt(1 - e2W * Math.sin(phi) ** 2);
    phi = Math.atan2(z2 + e2W * nuW * Math.sin(phi), p);
  }
  return { latitude: deg(phi), longitude: deg(Math.atan2(y2, x2)) };
}
