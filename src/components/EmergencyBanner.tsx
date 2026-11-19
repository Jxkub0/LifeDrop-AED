import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { call999 } from '../services/external';
import { useTheme } from '../state/SettingsContext';

/** Persistent reminder shown at the bottom of every screen. Tapping it opens the phone dialler with 999. */
export function EmergencyBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;
  return (
    <View
      style={{
        backgroundColor: c.banner,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 6,
        paddingHorizontal: theme.space(3),
        borderTopWidth: theme.highContrast ? 3 : 0,
        borderTopColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space(2),
      }}
    >
      {theme.easy ? null : <MaterialCommunityIcons name="phone-alert" size={theme.font.large} color={c.onBanner} />}
      <Text
        style={{ color: c.onBanner, fontSize: theme.easy ? theme.font.small : 13, fontWeight: '600', flex: 1 }}
        accessibilityRole="text"
      >
        In a cardiac emergency, always call 999 first.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Call 999"
        accessibilityHint="Opens the phone dialler with 999 entered"
        onPress={() => call999()}
        hitSlop={8}
        style={({ pressed }) => ({
          backgroundColor: theme.highContrast ? '#000000' : c.emergency,
          borderRadius: 8,
          borderWidth: theme.highContrast ? 2 : 0,
          borderColor: '#FFFFFF',
          paddingHorizontal: theme.space(3),
          minHeight: theme.easy ? 60 : 40,
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: theme.easy ? theme.font.small : 14 }}>Call 999</Text>
      </Pressable>
    </View>
  );
}
