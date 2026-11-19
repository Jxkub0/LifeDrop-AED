import { LocationManager as MapLibreLocationManager } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import type { LatLng } from '../lib/types';

export type PermissionState = 'undetermined' | 'granted' | 'denied';

export async function getPermissionState(): Promise<PermissionState> {
  const res = await Location.getForegroundPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionState> {
  const res = await Location.requestForegroundPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'undetermined' : 'denied';
}

/* ------------------------------------------------------------------ */
/* Fallback location engine. expo-location uses Google Play services   */
/* on Android; phones without them (Huawei, de-Googled ROMs, some      */
/* emulators) get positions from MapLibre's engine, which uses the     */
/* plain Android LocationManager.                                      */
/* ------------------------------------------------------------------ */

type MlPosition = { coords: { latitude: number; longitude: number } };
interface MlLocationManager {
  getCurrentPosition(): Promise<MlPosition | undefined>;
  addListener(fn: (p: MlPosition) => void): void;
  removeListener(fn: (p: MlPosition) => void): void;
}

// Must be a static import: require() would load a second copy of MapLibre (its package
// exports differ for import/require) and register its native views twice.
function mapLibreLocation(): MlLocationManager | null {
  return (MapLibreLocationManager as unknown as MlLocationManager) ?? null;
}

function fallbackFix(timeoutMs: number): Promise<LatLng | null> {
  const lm = mapLibreLocation();
  if (!lm) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (p: LatLng | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lm.removeListener(onUpdate);
      resolve(p);
    };
    const onUpdate = (pos: MlPosition) => finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    const timer = setTimeout(() => finish(null), timeoutMs);
    lm.getCurrentPosition()
      .then((pos) => pos && finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
      .catch(() => undefined);
    lm.addListener(onUpdate);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Current position, preferring speed: a recent last-known fix is returned
 * immediately, otherwise a fresh high-accuracy fix (up to ~12 s).
 */
export async function getCurrentLocation(opts: { maxAgeMs?: number } = {}): Promise<LatLng | null> {
  const maxAge = opts.maxAgeMs ?? 30_000;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge, requiredAccuracy: 100 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch {
    // ignore – fall through to a fresh fix
  }
  try {
    const fix = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      12_000,
    );
    if (fix) return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
    const coarse = await Location.getLastKnownPositionAsync();
    if (coarse) return { latitude: coarse.coords.latitude, longitude: coarse.coords.longitude };
  } catch {
    // fall through to the fallback engine
  }
  return fallbackFix(10_000);
}

/** Keep the user's position fresh while the app is open (distance updates on cards). */
export async function watchLocation(onChange: (p: LatLng) => void): Promise<() => void> {
  // The fallback engine listens only until expo-location delivers its first fix.
  const lm = mapLibreLocation();
  let fallbackActive = false;
  const onFallback = (pos: MlPosition) => onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
  const stopFallback = () => {
    if (lm && fallbackActive) lm.removeListener(onFallback);
    fallbackActive = false;
  };
  if (lm) {
    try {
      lm.addListener(onFallback);
      fallbackActive = true;
    } catch {
      fallbackActive = false;
    }
  }
  let sub: { remove: () => void } | null = null;
  try {
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 10_000 },
      (pos) => {
        stopFallback();
        onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
    );
  } catch {
    sub = null;
  }
  return () => {
    sub?.remove();
    stopFallback();
  };
}

export async function deviceGeocode(query: string): Promise<LatLng | null> {
  try {
    const results = await Location.geocodeAsync(`${query}, United Kingdom`);
    const r = results[0];
    return r ? { latitude: r.latitude, longitude: r.longitude } : null;
  } catch {
    return null;
  }
}
