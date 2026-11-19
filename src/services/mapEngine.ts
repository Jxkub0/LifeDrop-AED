import * as MapLibre from '@maplibre/maplibre-react-native';
import { config } from '../lib/config';

/**
 * One-off configuration of the native map engine: identify the app on tile
 * requests (as OpenFreeMap asks) and size the automatic cache of recently
 * viewed map areas, which keeps them visible when the signal drops.
 */
type MapLibreModule = {
  TransformRequestManager: { addHeader: (o: { name: string; value: string; match?: string }) => string };
  OfflineManager: {
    setMaximumAmbientCacheSize: (bytes: number) => Promise<void>;
    clearAmbientCache: () => Promise<void>;
  };
  NetworkManager: { setConnected: (c: boolean) => void };
};

// Static import only – require() would load a second copy of MapLibre and crash on start.
function maplibre(): MapLibreModule | null {
  return (MapLibre as unknown as MapLibreModule) ?? null;
}

let headerAdded = false;

export function configureMapEngine(cacheMb: number): void {
  const ml = maplibre();
  if (!ml) return;
  try {
    if (!headerAdded) {
      ml.TransformRequestManager.addHeader({ name: 'User-Agent', value: config.userAgent, match: 'tiles\\.openfreemap\\.org' });
      headerAdded = true;
    }
  } catch {
    // older native module – not critical
  }
  ml.OfflineManager.setMaximumAmbientCacheSize(Math.max(10, cacheMb) * 1024 * 1024).catch(() => undefined);
}

export async function clearMapCache(): Promise<void> {
  const ml = maplibre();
  if (ml) await ml.OfflineManager.clearAmbientCache();
}

/** Tell the map engine about connectivity so it stops retrying downloads while offline. */
export function setMapEngineOnline(online: boolean): void {
  try {
    maplibre()?.NetworkManager.setConnected(online);
  } catch {
    // ignore
  }
}
