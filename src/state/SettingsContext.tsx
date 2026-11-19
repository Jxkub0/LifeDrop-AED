import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import type { MapStyleId } from '../lib/mapStyles';
import { readJson, writeJson } from '../services/storage';
import { makeTheme, type TextSize, type Theme } from '../theme/theme';

export type UiMode = 'standard' | 'easy';
export type Units = 'metric' | 'imperial' | 'both';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MapAppPref = 'ask' | 'google' | 'apple' | 'waze';
export type TravelMode = 'walking' | 'driving';
export type SpeechRate = 'slow' | 'normal' | 'fast';
export type { TextSize };

export interface Settings {
  onboarded: boolean;
  uiMode: UiMode;
  highContrast: boolean;
  voiceGuidance: boolean;

  /* Display */
  themeMode: ThemeMode;
  textSize: TextSize;
  units: Units;
  largeMarkers: boolean;

  /* Map */
  mapStyle: MapStyleId;
  clusterMarkers: boolean;
  buildings3d: boolean;
  showPoi: boolean;
  /** Lock the map facing north (no two-finger rotate). */
  northUp: boolean;
  showScaleBar: boolean;
  /** Use downloaded offline maps even when online (saves mobile data). */
  preferOfflineMaps: boolean;
  /** Size of the automatic cache of recently viewed map areas (MB). */
  mapCacheMb: number;

  /* Which defibrillators to show */
  showClosed: boolean;
  showUnknown: boolean;
  showRestricted: boolean;
  showCommunity: boolean;
  showFeeds: boolean;

  /* Directions & search */
  preferredMapApp: MapAppPref;
  travelMode: TravelMode;
  /** Radius searched first by "Find nearest" (km). */
  searchRadiusKm: number;

  /* Voice & feedback */
  speechRate: SpeechRate;
  haptics: boolean;
  /** Keep the screen on while a defibrillator's details are open. */
  keepAwake: boolean;

  /* Data sources */
  autoUpdateData: boolean;
  updateOnWifiOnly: boolean;
  /** Also query OpenStreetMap live (Overpass) for the visible area – catches edits made minutes ago. */
  liveOsmUpdates: boolean;
  /** Feed ids the user has switched off. */
  disabledFeeds: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  uiMode: 'standard',
  highContrast: false,
  voiceGuidance: false,
  themeMode: 'system',
  textSize: 'normal',
  units: 'both',
  largeMarkers: false,
  mapStyle: 'streets',
  clusterMarkers: true,
  buildings3d: false,
  showPoi: true,
  northUp: false,
  showScaleBar: false,
  preferOfflineMaps: false,
  mapCacheMb: 150,
  showClosed: true,
  showUnknown: true,
  showRestricted: false,
  showCommunity: true,
  showFeeds: true,
  preferredMapApp: 'ask',
  travelMode: 'walking',
  searchRadiusKm: 3,
  speechRate: 'normal',
  haptics: true,
  keepAwake: true,
  autoUpdateData: true,
  updateOnWifiOnly: false,
  liveOsmUpdates: false,
  disabledFeeds: [],
};

const KEY = 'settings.v1';

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  theme: Theme;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Read synchronously so the first frame already uses the right layout and colours.
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...(readJson<Partial<Settings>>(KEY) ?? {}),
  }));
  const scheme = useColorScheme();

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeJson(KEY, next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings((prev) => {
      // Keep onboarding done and the chosen view – everything else back to defaults.
      const next = { ...DEFAULT_SETTINGS, onboarded: prev.onboarded, uiMode: prev.uiMode };
      writeJson(KEY, next);
      return next;
    });
  }, []);

  const dark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && scheme === 'dark');
  const theme = useMemo(
    () =>
      makeTheme({
        easy: settings.uiMode === 'easy',
        highContrast: settings.highContrast,
        dark,
        textSize: settings.textSize,
        largeMarkers: settings.largeMarkers,
      }),
    [settings.uiMode, settings.highContrast, dark, settings.textSize, settings.largeMarkers],
  );

  const value = useMemo(() => ({ settings, update, reset, theme }), [settings, update, reset, theme]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

export function useTheme(): Theme {
  return useSettings().theme;
}
