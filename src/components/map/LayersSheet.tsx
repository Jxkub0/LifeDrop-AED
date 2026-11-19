import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAP_STYLES, type MapStyleId } from '../../lib/mapStyles';
import { useDefibs } from '../../state/DefibContext';
import { useSettings } from '../../state/SettingsContext';
import { AppText, LinkRow, ToggleRow, type IconName } from '../ui';

const PREVIEW: Record<MapStyleId, { bg: string; fg: string; icon: IconName }> = {
  streets: { bg: '#E8F0E3', fg: '#3C7A3B', icon: 'map' },
  satellite: { bg: '#2F3B2A', fg: '#D9E6C9', icon: 'satellite-variant' },
  hybrid: { bg: '#36452F', fg: '#FFFFFF', icon: 'map-marker-radius' },
  light: { bg: '#F2F3F4', fg: '#6B7280', icon: 'map-outline' },
  dark: { bg: '#1F2937', fg: '#E5E7EB', icon: 'weather-night' },
};

/** Google-Maps-style "Layers" sheet: map type, map details and which defibrillators to show. */
export function LayersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, update, theme } = useSettings();
  const { online } = useDefibs();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close map layers" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View
        accessibilityViewIsModal
        style={{
          maxHeight: '82%',
          backgroundColor: c.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: theme.highContrast ? 3 : 0,
          borderColor: c.border,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
          <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Map type
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={10}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}
          >
            <MaterialCommunityIcons name="close" size={26} color={c.text} />
            {theme.easy ? <Text style={{ color: c.text, fontWeight: '700', fontSize: theme.font.small }}>Close</Text> : null}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8 }}>
            {MAP_STYLES.map((s) => {
              const selected = settings.mapStyle === s.id;
              const p = PREVIEW[s.id];
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${s.label} map. ${s.description}${!s.offline ? '. Needs internet' : ''}`}
                  onPress={() => update({ mapStyle: s.id })}
                  style={{ width: theme.easy ? 100 : 84, alignItems: 'center', gap: 6 }}
                >
                  <View
                    style={{
                      width: theme.easy ? 84 : 68,
                      height: theme.easy ? 84 : 68,
                      borderRadius: 16,
                      backgroundColor: p.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? (theme.highContrast ? c.focus : c.primary) : c.border,
                    }}
                  >
                    <MaterialCommunityIcons name={p.icon} size={30} color={p.fg} />
                  </View>
                  <Text
                    style={{
                      color: selected ? (theme.highContrast ? c.focus : c.primary) : c.text,
                      fontWeight: selected ? '700' : '500',
                      fontSize: theme.font.small,
                      textAlign: 'center',
                    }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!online && (settings.mapStyle === 'satellite' || settings.mapStyle === 'hybrid') ? (
            <AppText variant="small" muted>
              Satellite photos need an internet connection.
            </AppText>
          ) : null}

          <AppText variant="large" bold accessibilityRole="header" style={{ marginTop: 8 }}>
            Map details
          </AppText>
          <ToggleRow
            icon="google-circles-communities"
            label="Group nearby markers"
            description="Show a count when zoomed out"
            value={settings.clusterMarkers}
            onValueChange={(v) => update({ clusterMarkers: v })}
          />
          <ToggleRow
            icon="cube-outline"
            label="3D buildings"
            description="Tilt the map with two fingers"
            value={settings.buildings3d}
            onValueChange={(v) => update({ buildings3d: v })}
          />
          <ToggleRow
            icon="store-marker-outline"
            label="Shops and places"
            value={settings.showPoi}
            onValueChange={(v) => update({ showPoi: v })}
          />
          <ToggleRow
            icon="magnify-plus-outline"
            label="Larger markers"
            value={settings.largeMarkers}
            onValueChange={(v) => update({ largeMarkers: v })}
          />

          <AppText variant="large" bold accessibilityRole="header" style={{ marginTop: 8 }}>
            Show defibrillators that are
          </AppText>
          <ToggleRow
            icon="close-box-outline"
            label="Closed right now"
            value={settings.showClosed}
            onValueChange={(v) => update({ showClosed: v })}
          />
          <ToggleRow
            icon="help-rhombus-outline"
            label="Hours not confirmed"
            value={settings.showUnknown}
            onValueChange={(v) => update({ showUnknown: v })}
          />
          <ToggleRow
            icon="lock-outline"
            label="Private / staff only"
            value={settings.showRestricted}
            onValueChange={(v) => update({ showRestricted: v })}
          />
          <ToggleRow
            icon="account-group-outline"
            label="Added by app users"
            value={settings.showCommunity}
            onValueChange={(v) => update({ showCommunity: v })}
          />
          <ToggleRow
            icon="database-outline"
            label="From council open data"
            value={settings.showFeeds}
            onValueChange={(v) => update({ showFeeds: v })}
          />
          <LinkRow
            icon="download-circle-outline"
            label="Offline maps"
            description="Save maps to use without signal"
            onPress={() => {
              onClose();
              router.push('/offline');
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
