import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TravelMode } from '../lib/links';
import type { LatLng } from '../lib/types';
import { getMapApps, type MapApp } from '../services/external';
import { useSettings } from '../state/SettingsContext';
import { AppText, BigButton } from './ui';

const APP_ICONS = {
  apple: 'apple',
  google: 'google-maps',
  waze: 'waze',
  other: 'map-search',
} as const;

/** Bottom sheet listing the map apps available on this phone for turn-by-turn directions. */
export function MapAppPicker({
  visible,
  onClose,
  target,
  label,
}: {
  visible: boolean;
  onClose: () => void;
  target: LatLng;
  label?: string;
}) {
  const { theme, settings } = useSettings();
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<MapApp[]>([]);
  const [mode, setMode] = useState<TravelMode>(settings.travelMode);

  useEffect(() => {
    if (visible) getMapApps(target, label).then(setApps);
  }, [visible, target, label]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close directions options"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: theme.colors.background,
          padding: theme.space(4),
          paddingBottom: theme.space(4) + insets.bottom,
          gap: theme.space(3),
          borderTopLeftRadius: theme.radius * 1.5,
          borderTopRightRadius: theme.radius * 1.5,
          borderTopWidth: theme.highContrast ? 3 : 0,
          borderColor: theme.colors.border,
        }}
      >
        <AppText variant="title" accessibilityRole="header">
          Get directions
        </AppText>
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <BigButton
            label="Walking"
            icon="walk"
            variant={mode === 'walking' ? 'primary' : 'secondary'}
            onPress={() => setMode('walking')}
            style={{ flex: 1 }}
            hint={mode === 'walking' ? 'Selected' : undefined}
          />
          <BigButton
            label="Driving"
            icon="car"
            variant={mode === 'driving' ? 'primary' : 'secondary'}
            onPress={() => setMode('driving')}
            style={{ flex: 1 }}
            hint={mode === 'driving' ? 'Selected' : undefined}
          />
        </View>
        <AppText variant="body" muted>
          Choose a map app:
        </AppText>
        {apps.map((app) => (
          <BigButton
            key={app.id}
            label={app.label}
            sublabel={!app.supportsWalking && mode === 'walking' ? 'Driving directions only' : undefined}
            icon={APP_ICONS[app.id]}
            variant="secondary"
            onPress={async () => {
              await app.open(mode);
              onClose();
            }}
          />
        ))}
        <BigButton label="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}
