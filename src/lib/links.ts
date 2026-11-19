import type { LatLng } from './types';

/**
 * Pure URL builders for third-party apps. The service layer decides which
 * to open based on platform and installed apps.
 */

export type TravelMode = 'walking' | 'driving';

const coord = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/** Google Maps URLs API – Street View panorama nearest to the point. Works on iOS, Android and web. */
export function streetViewUrl(p: LatLng): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coord(p)}`;
}

/** Google Maps iOS app scheme opened straight into Street View. */
export function streetViewIosAppUrl(p: LatLng): string {
  return `comgooglemaps://?center=${coord(p)}&mapmode=streetview`;
}

export function appleMapsDirectionsUrl(p: LatLng, mode: TravelMode, label?: string): string {
  const q = label ? `&q=${encodeURIComponent(label)}` : '';
  return `https://maps.apple.com/?daddr=${coord(p)}&dirflg=${mode === 'walking' ? 'w' : 'd'}${q}`;
}

/** Universal Google Maps directions link – opens the app if installed, otherwise the browser. */
export function googleMapsDirectionsUrl(p: LatLng, mode: TravelMode): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}&travelmode=${mode}&dir_action=navigate`;
}

/** Google Maps iOS app scheme (used when the app is installed). */
export function googleMapsIosAppUrl(p: LatLng, mode: TravelMode): string {
  return `comgooglemaps://?daddr=${coord(p)}&directionsmode=${mode}`;
}

/** Waze universal link (driving only – Waze has no walking mode). */
export function wazeUrl(p: LatLng): string {
  return `https://waze.com/ul?ll=${coord(p)}&navigate=yes&utm_source=uklifedrop`;
}

/** Android geo: intent – lets the user pick any installed map app. */
export function androidGeoUrl(p: LatLng, label = 'Defibrillator'): string {
  return `geo:${coord(p)}?q=${coord(p)}(${encodeURIComponent(label)})`;
}

/** what3words app deep link for a known 3 word address. */
export function what3wordsAppUrl(words: string): string {
  return `w3w://show?threewords=${encodeURIComponent(words)}`;
}

export function what3wordsWebUrl(words: string): string {
  return `https://what3words.com/${encodeURIComponent(words)}`;
}

/**
 * Best-effort web fallback when no API key is configured: the what3words map
 * accepts coordinates in its search, so we pass them in the path.
 */
export function what3wordsCoordinatesUrl(p: LatLng): string {
  return `https://what3words.com/${coord(p)}`;
}

export function telUrl(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}
