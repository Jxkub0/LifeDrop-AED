import { router, type Href } from 'expo-router';
import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { call999 } from '../../services/external';
import { useSettings } from '../../state/SettingsContext';
import { AppText, LinkRow } from '../ui';

/** Side menu opened from the search bar (like Google Maps' account menu). */
export function MainMenu({ visible, onClose, onShowKey }: { visible: boolean; onClose: () => void; onShowKey: () => void }) {
  const { theme, settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View
          accessibilityViewIsModal
          style={{
            width: '84%',
            maxWidth: 380,
            backgroundColor: c.background,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom,
            borderTopRightRadius: 24,
            borderBottomRightRadius: 24,
            borderRightWidth: theme.highContrast ? 3 : 0,
            borderColor: c.border,
          }}
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <AppText variant="title" accessibilityRole="header">
              UK LifeDrop AED
            </AppText>
            <AppText variant="small" muted style={{ marginBottom: 12 }}>
              Public defibrillators across the UK
            </AppText>
            <LinkRow icon="phone-alert" label="Call 999" description="Always call first in a cardiac emergency" danger onPress={() => call999()} />
            <LinkRow icon="format-list-bulleted" label="Nearby list" description="Closest defibrillators, nearest first" onPress={() => go('/nearby')} />
            <LinkRow icon="plus-circle-outline" label="Add a defibrillator" description="Missing from the map? Add it" onPress={() => go('/add')} />
            <LinkRow icon="download-circle-outline" label="Offline maps" description="Save maps for areas with no signal" onPress={() => go('/offline')} />
            <LinkRow icon="database-sync-outline" label="Data sources" description="Where the defibrillators come from" onPress={() => go('/sources')} />
            <LinkRow
              icon="map-legend"
              label="Map key"
              description="What the marker shapes mean"
              onPress={() => {
                onClose();
                onShowKey();
              }}
            />
            <LinkRow
              icon={settings.uiMode === 'easy' ? 'view-dashboard-outline' : 'format-size'}
              label={settings.uiMode === 'easy' ? 'Switch to Standard view' : 'Switch to Easy view'}
              description={settings.uiMode === 'easy' ? 'Full map with filters' : 'Bigger text and buttons'}
              onPress={() => {
                onClose();
                update({ uiMode: settings.uiMode === 'easy' ? 'standard' : 'easy' });
                router.replace('/');
              }}
            />
            <LinkRow icon="cog-outline" label="Settings" onPress={() => go('/settings')} />
          </ScrollView>
        </View>
        <Pressable accessibilityLabel="Close menu" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      </View>
    </Modal>
  );
}
