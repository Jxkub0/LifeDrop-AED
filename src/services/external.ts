import { Linking, Platform } from 'react-native';
import { config } from '../lib/config';
import {
  androidGeoUrl,
  appleMapsDirectionsUrl,
  googleMapsDirectionsUrl,
  googleMapsIosAppUrl,
  streetViewIosAppUrl,
  streetViewUrl,
  telUrl,
  wazeUrl,
  what3wordsAppUrl,
  what3wordsCoordinatesUrl,
  what3wordsWebUrl,
  type TravelMode,
} from '../lib/links';
import type { LatLng } from '../lib/types';
import { getCachedWords, setCachedWords } from './db';

async function canOpen(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

/** Try each URL in turn until one opens. */
export async function openFirst(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // try the next one
    }
  }
  return false;
}

export function call999(): Promise<boolean> {
  return openFirst([telUrl('999')]);
}

export async function openStreetView(p: LatLng): Promise<boolean> {
  if (Platform.OS === 'ios' && (await canOpen('comgooglemaps://'))) {
    return openFirst([streetViewIosAppUrl(p), streetViewUrl(p)]);
  }
  return openFirst([streetViewUrl(p)]);
}

/* ---------------- what3words ---------------- */

export const what3wordsConfigured = Boolean(config.what3wordsApiKey);

/** Resolve the 3 word address for a point (requires EXPO_PUBLIC_W3W_API_KEY). Cached locally. */
export async function getWhat3Words(id: string, p: LatLng): Promise<string | null> {
  if (!what3wordsConfigured) return null;
  const cached = await getCachedWords(id, p.latitude, p.longitude).catch(() => null);
  if (cached) return cached;
  const url =
    `https://api.what3words.com/v3/convert-to-3wa?coordinates=${p.latitude},${p.longitude}` +
    `&language=en&format=json&key=${encodeURIComponent(config.what3wordsApiKey)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { words?: string };
  if (!json.words) return null;
  await setCachedWords(id, p.latitude, p.longitude, json.words).catch(() => undefined);
  return json.words;
}

export async function openWhat3Words(p: LatLng, words: string | null): Promise<boolean> {
  if (words) {
    const app = what3wordsAppUrl(words);
    // iOS needs canOpenURL (scheme declared in LSApplicationQueriesSchemes); Android just tries.
    if (Platform.OS === 'ios') {
      if (await canOpen(app)) return openFirst([app]);
      return openFirst([what3wordsWebUrl(words)]);
    }
    return openFirst([app, what3wordsWebUrl(words)]);
  }
  return openFirst([what3wordsCoordinatesUrl(p)]);
}

/* ---------------- map apps ---------------- */

export interface MapApp {
  id: 'apple' | 'google' | 'waze' | 'other';
  label: string;
  supportsWalking: boolean;
  open: (mode: TravelMode) => Promise<boolean>;
}

/** The map apps offered in the "Get Directions" picker for this device. */
export async function getMapApps(p: LatLng, label?: string): Promise<MapApp[]> {
  const apps: MapApp[] = [];
  if (Platform.OS === 'ios') {
    apps.push({
      id: 'apple',
      label: 'Apple Maps',
      supportsWalking: true,
      open: (mode) => openFirst([appleMapsDirectionsUrl(p, mode, label)]),
    });
    const hasGoogle = await canOpen('comgooglemaps://');
    apps.push({
      id: 'google',
      label: hasGoogle ? 'Google Maps' : 'Google Maps (in browser)',
      supportsWalking: true,
      open: (mode) =>
        openFirst(hasGoogle ? [googleMapsIosAppUrl(p, mode), googleMapsDirectionsUrl(p, mode)] : [googleMapsDirectionsUrl(p, mode)]),
    });
    if (await canOpen('waze://')) {
      apps.push({ id: 'waze', label: 'Waze', supportsWalking: false, open: () => openFirst([wazeUrl(p)]) });
    }
  } else {
    apps.push({
      id: 'google',
      label: 'Google Maps',
      supportsWalking: true,
      open: (mode) => openFirst([googleMapsDirectionsUrl(p, mode)]),
    });
    apps.push({ id: 'waze', label: 'Waze', supportsWalking: false, open: () => openFirst([wazeUrl(p)]) });
    apps.push({
      id: 'other',
      label: 'Another map app',
      supportsWalking: true,
      open: () => openFirst([androidGeoUrl(p, label)]),
    });
  }
  return apps;
}
