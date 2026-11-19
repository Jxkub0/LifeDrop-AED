import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BigButton, Card, ChoiceCard, Screen, SectionTitle, ToggleRow } from '../components/ui';
import { speak } from '../services/speech';
import { useDefibs } from '../state/DefibContext';
import { useSettings, type UiMode } from '../state/SettingsContext';

export default function Onboarding() {
  const { settings, update, theme } = useSettings();
  const { requestLocation } = useDefibs();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'style' | 'location'>('style');
  const [busy, setBusy] = useState(false);

  const chooseMode = (mode: UiMode) => {
    // Easy view uses the high-contrast colour scheme by default; it can still be switched off below.
    if (mode === 'easy' && settings.uiMode !== 'easy') update({ uiMode: mode, highContrast: true });
    else update({ uiMode: mode });
  };

  const finish = () => {
    update({ onboarded: true });
    router.replace('/');
  };

  if (step === 'location') {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + theme.space(6) }}>
        <MaterialCommunityIcons name="crosshairs-gps" size={theme.font.huge * 2} color={theme.colors.text} />
        <SectionTitle>Allow location</SectionTitle>
        <AppText variant="large">
          To find the nearest defibrillator in an emergency, the app needs to know where you are. Your location stays on
          this phone – it is only used to search the map.
        </AppText>
        <BigButton
          label="Allow location"
          icon="map-marker-check"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await requestLocation();
            setBusy(false);
            finish();
          }}
        />
        <BigButton label="Not now" variant="secondary" onPress={finish} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ paddingTop: insets.top + theme.space(4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
        <MaterialCommunityIcons name="heart-flash" size={theme.font.huge * 1.6} color={theme.colors.emergency} />
        <View style={{ flex: 1 }}>
          <AppText variant="huge" accessibilityRole="header">
            UK LifeDrop AED
          </AppText>
          <AppText variant="body" muted>
            Find, check and get to public defibrillators.
          </AppText>
        </View>
      </View>

      <SectionTitle>Choose how the app looks</SectionTitle>
      <AppText variant="body" muted>
        You can change this at any time in Settings.
      </AppText>

      <View accessibilityRole="radiogroup" style={{ gap: theme.space(3) }}>
        <ChoiceCard
          title="Standard view"
          description="Full interactive map with filters, search and community additions."
          icon="map-legend"
          selected={settings.uiMode === 'standard'}
          onPress={() => chooseMode('standard')}
        />
        <ChoiceCard
          title="Easy view"
          description="Extra-large text and buttons, high contrast, every button labelled, and one big “Find nearest defibrillator now” button."
          icon="format-size"
          selected={settings.uiMode === 'easy'}
          onPress={() => chooseMode('easy')}
        />
      </View>

      <Card>
        <ToggleRow
          label="High-contrast colours"
          description="Black background, white text and bright buttons."
          value={settings.highContrast}
          onValueChange={(v) => update({ highContrast: v })}
        />
        <ToggleRow
          label="Voice guidance"
          description="Reads out the distance, walking direction and cabinet code when you choose a defibrillator."
          value={settings.voiceGuidance}
          onValueChange={(v) => {
            update({ voiceGuidance: v });
            if (v) speak('Voice guidance is on.');
          }}
        />
      </Card>

      <BigButton label="Continue" icon="arrow-right" onPress={() => setStep('location')} />
    </Screen>
  );
}
