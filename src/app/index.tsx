import { Redirect } from 'expo-router';
import React from 'react';
import { EasyHome } from '../screens/EasyHome';
import { MapScreen } from '../screens/MapScreen';
import { useSettings } from '../state/SettingsContext';

export default function Home() {
  const { settings } = useSettings();
  if (!settings.onboarded) return <Redirect href="/onboarding" />;
  return settings.uiMode === 'easy' ? <EasyHome /> : <MapScreen asHome />;
}
