import { useMemo, useSyncExternalStore } from 'react';
import { config } from '../../lib/config';
import { buildMapStyle, MAP_STYLES, offlineFallback, type MapStyleId } from '../../lib/mapStyles';
import { areasVersion, offlineRefs, subscribeAreas } from '../../services/offlineMaps';
import { useDefibs } from '../../state/DefibContext';
import { useSettings } from '../../state/SettingsContext';

export interface ResolvedMapStyle {
  style: ReturnType<typeof buildMapStyle>;
  /** The style actually shown (satellite falls back to streets when offline). */
  shownId: MapStyleId;
  usingOffline: boolean;
  /** Short note for the UI, e.g. "Satellite needs internet – showing saved map". */
  note: string | null;
}

/** Work out which map style to draw from the settings, connectivity and saved offline maps. */
export function useMapStyle(override?: MapStyleId): ResolvedMapStyle {
  const { settings } = useSettings();
  const { online } = useDefibs();
  const v = useSyncExternalStore(subscribeAreas, areasVersion, areasVersion);
  const wanted = override ?? settings.mapStyle;

  return useMemo(() => {
    void v;
    const refs = offlineRefs();
    const wantOffline = !!refs && (!online || settings.preferOfflineMaps);
    const info = MAP_STYLES.find((s) => s.id === wanted);
    let shownId = wanted;
    let note: string | null = null;
    if (wantOffline && info && !info.offline) {
      shownId = offlineFallback(wanted);
      note = online ? 'Showing saved map – satellite needs a connection' : 'Offline – showing saved map';
    } else if (wantOffline && !online) {
      note = 'Offline – showing saved map';
    }
    const style = buildMapStyle(shownId, {
      buildings3d: settings.buildings3d,
      pointsOfInterest: settings.showPoi,
      offline: wantOffline ? refs : null,
      satelliteTiles: config.satelliteTileUrl || null,
      satelliteAttribution: config.satelliteAttribution || null,
    });
    return { style, shownId, usingOffline: wantOffline, note };
  }, [v, online, wanted, settings.preferOfflineMaps, settings.buildings3d, settings.showPoi]);
}
