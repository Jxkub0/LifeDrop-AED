import React, { useCallback, useState } from 'react';
import { MapAppPicker } from '../components/MapAppPicker';
import type { LatLng } from '../lib/types';
import { getMapApps } from '../services/external';
import { useSettings } from './SettingsContext';

/**
 * "Directions" button behaviour: open the user's preferred map app straight
 * away, or show the picker if they chose "Ask each time" (or it fails).
 */
export function useDirections() {
  const { settings } = useSettings();
  const [target, setTarget] = useState<{ point: LatLng; label?: string } | null>(null);

  const open = useCallback(
    async (point: LatLng, label?: string) => {
      if (settings.preferredMapApp !== 'ask') {
        const apps = await getMapApps(point, label);
        const app = apps.find((a) => a.id === settings.preferredMapApp);
        if (app) {
          const ok = await app.open(app.supportsWalking ? settings.travelMode : 'driving');
          if (ok) return;
        }
      }
      setTarget({ point, label });
    },
    [settings.preferredMapApp, settings.travelMode],
  );

  const picker = target ? (
    <MapAppPicker visible onClose={() => setTarget(null)} target={target.point} label={target.label} />
  ) : null;

  return { open, picker };
}
