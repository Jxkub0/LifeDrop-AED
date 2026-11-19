import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { compassDirection, drivingMinutes, formatDistance, walkingMinutes } from '../lib/geo';
import type { DefibWithMeta } from '../lib/types';
import { spellOut } from '../lib/voice';
import { useSettings, useTheme, type Units } from '../state/SettingsContext';
import { StatusBadge, StatusIcon } from './StatusIcon';
import { AppText } from './ui';

export function defibTitle(d: Pick<DefibWithMeta, 'name' | 'source' | 'sourceName'>): string {
  return (
    d.name ||
    (d.source === 'community' ? 'Community-added defibrillator' : d.source === 'feed' ? 'Council-listed defibrillator' : 'Public defibrillator')
  );
}

export function distanceText(meters: number, units: Units): string {
  const d = formatDistance(meters);
  return units === 'both' ? d.both : d[units];
}

/** "4 min walk" or "2 min drive" depending on the travel mode setting. */
export function useTravelTime() {
  const { settings } = useSettings();
  return (meters: number) =>
    settings.travelMode === 'driving' ? `${drivingMinutes(meters)} min drive` : `${walkingMinutes(meters)} min walk`;
}

/** Distance line, e.g. "240 metres (260 yards) · about 4 min walk · north-east". */
export function DistanceLine({ defib, large }: { defib: DefibWithMeta; large?: boolean }) {
  const { theme, settings } = useSettings();
  const travel = useTravelTime();
  if (defib.distanceM === undefined) {
    return (
      <AppText variant={large ? 'large' : 'body'} muted>
        Turn on location to see the distance
      </AppText>
    );
  }
  const dir = defib.bearingDeg !== undefined ? compassDirection(defib.bearingDeg) : null;
  return (
    <View style={{ gap: 2 }}>
      <AppText variant={large ? 'title' : 'large'} bold>
        {distanceText(defib.distanceM, settings.units)}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
        <MaterialCommunityIcons name={settings.travelMode === 'driving' ? 'car' : 'walk'} size={theme.font.body} color={theme.colors.text} />
        <AppText variant={large ? 'large' : 'body'} style={{ flex: 1 }}>
          About {travel(defib.distanceM)}
          {dir ? ` · to the ${dir}` : ''}
        </AppText>
      </View>
    </View>
  );
}

/** Large, high-visibility cabinet code. */
export function PinCode({ code, compact }: { code: string; compact?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View
      accessible
      accessibilityLabel={`Cabinet code: ${spellOut(code)}`}
      style={{
        borderWidth: 3,
        borderColor: theme.highContrast ? c.focus : c.text,
        backgroundColor: theme.highContrast ? '#000000' : '#FFFFFF',
        borderRadius: theme.radius,
        padding: compact ? theme.space(2) : theme.space(3),
        alignItems: 'center',
      }}
    >
      <Text style={{ color: theme.highContrast ? '#FFFFFF' : '#0B0C0C', fontSize: theme.font.small, fontWeight: '700' }}>
        CABINET CODE
      </Text>
      <Text
        style={{
          color: theme.highContrast ? c.focus : '#0B0C0C',
          fontSize: compact ? theme.font.title : theme.font.huge * 1.4,
          fontWeight: '900',
          letterSpacing: 6,
          fontVariant: ['tabular-nums'],
        }}
      >
        {code}
      </Text>
    </View>
  );
}

export function LockedNoCode() {
  return (
    <AppText variant="body" bold>
      Locked cabinet – the 999 call handler will give you the code.
    </AppText>
  );
}

/** Row used in the nearby list. */
export function DefibListItem({ defib, onPress }: { defib: DefibWithMeta; onPress: () => void }) {
  const { theme, settings } = useSettings();
  const c = theme.colors;
  const dist = defib.distanceM !== undefined ? distanceText(defib.distanceM, settings.units) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        defibTitle(defib),
        defib.availability.label,
        dist ?? '',
        defib.locationDescription ?? '',
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens details and directions"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.space(3),
        alignItems: 'center',
        padding: theme.space(3),
        minHeight: theme.touch,
        backgroundColor: pressed ? c.surfaceAlt : c.surface,
        borderRadius: theme.radius,
        borderWidth: theme.borderWidth,
        borderColor: c.border,
      })}
    >
      <StatusIcon status={defib.availability.status} community={defib.source !== 'osm'} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="large" bold numberOfLines={2}>
          {dist ?? defibTitle(defib)}
        </AppText>
        <AppText variant="small" bold>
          {defib.availability.label} – {defib.availability.detail}
        </AppText>
        {defib.locationDescription || defib.name ? (
          <AppText variant="small" muted numberOfLines={2}>
            {defib.locationDescription || defib.name}
          </AppText>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={theme.font.title} color={c.text} />
    </Pressable>
  );
}

export { StatusBadge };
