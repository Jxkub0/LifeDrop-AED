import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, BigButton, Notice, Screen } from '../components/ui';
import { call999 } from '../services/external';
import { useDefibs } from '../state/DefibContext';
import { openDefib, useFindNearest } from '../state/hooks';
import { useTheme } from '../state/SettingsContext';

/** Easy / senior-friendly home: one giant emergency button and a few clearly labelled options. */
export function EasyHome() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { permission } = useDefibs();
  const { run, busy } = useFindNearest();

  const findNow = async () => {
    const out = await run();
    if (!out?.result.best) return;
    openDefib(out.result.best.id, {
      emergency: true,
      unconfirmed: out.result.usedUnconfirmed,
      alt: out.result.closerUnconfirmed?.id,
    });
  };

  return (
    <Screen contentStyle={{ paddingTop: insets.top + theme.space(3), gap: theme.space(4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
        <MaterialCommunityIcons name="heart-flash" size={theme.font.huge} color={theme.colors.emergency} />
        <AppText variant="title" accessibilityRole="header">
          UK LifeDrop AED
        </AppText>
      </View>

      <BigButton
        testID="find-nearest-now"
        label={busy ? 'FINDING THE NEAREST DEFIBRILLATOR…' : 'FIND NEAREST DEFIBRILLATOR NOW'}
        sublabel={busy ? 'Please wait' : 'Shows the closest one you can use right now'}
        icon="map-marker-radius"
        variant="emergency"
        size="hero"
        loading={busy}
        onPress={findNow}
        style={{ minHeight: Math.max(theme.touch * 3.4, 240) }}
      />

      {permission === 'denied' ? (
        <Notice
          tone="warning"
          text="Location is switched off for this app. Turn it on in your phone's settings so we can find the nearest defibrillator."
        />
      ) : null}

      <BigButton label="Call 999" sublabel="Ambulance – call first" icon="phone" variant="emergency" onPress={() => call999()} />

      <View style={{ height: 2, backgroundColor: theme.colors.border, marginVertical: theme.space(1) }} />

      <BigButton label="List of nearby defibrillators" icon="format-list-bulleted" variant="secondary" onPress={() => router.push('/nearby')} />
      <BigButton label="Show the map" icon="map" variant="secondary" onPress={() => router.push('/map')} />
      <BigButton label="Add a defibrillator" icon="plus-circle" variant="secondary" onPress={() => router.push('/add')} />
      <BigButton label="Settings" icon="cog" variant="secondary" onPress={() => router.push('/settings')} />
    </Screen>
  );
}
