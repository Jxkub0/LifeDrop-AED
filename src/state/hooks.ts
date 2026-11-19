import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Share } from 'react-native';
import type { Defibrillator, DefibWithMeta } from '../lib/types';
import { buildVoiceMessage } from '../lib/voice';
import { call999 } from '../services/external';
import { speak, stopSpeaking } from '../services/speech';
import { useDefibs, type FindNearestOutcome } from './DefibContext';
import { useSettings } from './SettingsContext';

/* ---------------- route-safe ids ---------------- */

/** "osm:node/123" → "osm_node.123" (slashes would break the URL path). */
export function idToParam(id: string): string {
  return id.replace(':', '_').replace('/', '.');
}

export function paramToId(param: string): string {
  return param.replace('_', ':').replace('.', '/');
}

export function openDefib(id: string, extra: { emergency?: boolean; unconfirmed?: boolean; alt?: string } = {}) {
  router.push({
    pathname: '/defib/[id]',
    params: {
      id: idToParam(id),
      ...(extra.emergency ? { emergency: '1' } : {}),
      ...(extra.unconfirmed ? { unconfirmed: '1' } : {}),
      ...(extra.alt ? { alt: idToParam(extra.alt) } : {}),
    },
  });
}

/** In-app Street View (with the Mapillary photo of the unit when OpenStreetMap links one). */
export function openStreetViewScreen(d: Pick<Defibrillator, 'latitude' | 'longitude' | 'name' | 'mapillaryId'>) {
  router.push({
    pathname: '/streetview',
    params: {
      lat: String(d.latitude),
      lng: String(d.longitude),
      ...(d.name ? { title: d.name } : {}),
      ...(d.mapillaryId ? { mly: d.mapillaryId } : {}),
    },
  });
}

export function shareDefib(d: Defibrillator) {
  const where = [d.name, d.locationDescription].filter(Boolean).join(' – ');
  const url = `https://www.google.com/maps/search/?api=1&query=${d.latitude.toFixed(6)},${d.longitude.toFixed(6)}`;
  Share.share({
    message: `Public defibrillator${where ? `: ${where}` : ''}${d.pinCode ? ` (cabinet code ${d.pinCode})` : ''}\n${url}\nIn a cardiac emergency, always call 999 first.`,
  }).catch(() => undefined);
}

/* ---------------- find closest available ---------------- */

export function useFindNearest() {
  const { findNearest } = useDefibs();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (): Promise<Extract<FindNearestOutcome, { ok: true }> | null> => {
    setBusy(true);
    try {
      const out = await findNearest();
      if (!out.ok) {
        const noPermission = out.reason === 'no-permission';
        Alert.alert(
          noPermission ? 'Location is turned off' : 'Could not find your location',
          noPermission
            ? 'Allow location access so the app can find the nearest defibrillator. If someone has collapsed, call 999 now – the call handler can direct you to a defibrillator.'
            : 'Move to an open area and try again, or search for a postcode on the map. If someone has collapsed, call 999 now.',
          [
            { text: 'Call 999', onPress: () => call999(), style: 'destructive' },
            noPermission ? { text: 'Open settings', onPress: () => Linking.openSettings() } : { text: 'OK' },
          ],
        );
        return null;
      }
      if (!out.result.best) {
        Alert.alert(
          'No defibrillator found nearby',
          'None are recorded within 10 km. Call 999 – the call handler knows about defibrillators that are not on this map.',
          [{ text: 'Call 999', onPress: () => call999(), style: 'destructive' }, { text: 'OK' }],
        );
        return null;
      }
      return out;
    } finally {
      setBusy(false);
    }
  }, [findNearest]);

  return { run, busy };
}

/* ---------------- voice guidance ---------------- */

/** Reads the defibrillator details aloud when it is selected, if voice guidance is on. */
export function useVoiceGuidance(defib: DefibWithMeta | undefined | null) {
  const { settings } = useSettings();
  const spokenFor = useRef<string | null>(null);

  useEffect(() => {
    if (!settings.voiceGuidance || !defib) return;
    if (spokenFor.current === defib.id) return;
    // Wait for a distance if location is on its way.
    spokenFor.current = defib.id;
    speak(buildVoiceMessage(defib));
  }, [settings.voiceGuidance, defib]);

  useEffect(() => () => stopSpeaking(), []);

  return useCallback(() => {
    if (defib) speak(buildVoiceMessage(defib));
  }, [defib]);
}
