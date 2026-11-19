import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import type { AvailabilityStatus } from '../lib/types';
import { useTheme } from '../state/SettingsContext';
import type { IconName } from './ui';

/**
 * Colour *and* shape coding so status never relies on colour alone:
 *   available  → green circle with a tick
 *   closed     → red square with a cross
 *   restricted → grey square with a padlock
 *   unknown    → yellow diamond with a question mark
 */
export const STATUS_ICON: Record<AvailabilityStatus, IconName> = {
  available: 'check-bold',
  closed: 'close-thick',
  restricted: 'lock',
  unknown: 'help',
};

export const STATUS_SHAPE_LABEL: Record<AvailabilityStatus, string> = {
  available: 'green circle with tick',
  closed: 'red square with cross',
  restricted: 'grey square with padlock',
  unknown: 'yellow diamond with question mark',
};

export function StatusIcon({
  status,
  size,
  selected,
  community,
}: {
  status: AvailabilityStatus;
  size?: number;
  selected?: boolean;
  community?: boolean;
}) {
  const theme = useTheme();
  const s = size ?? theme.marker;
  const colors = theme.colors.status[status];
  const isDiamond = status === 'unknown';
  const inner = isDiamond ? s * 0.78 : s;
  const borderWidth = selected ? Math.max(3, s * 0.12) : Math.max(2, s * 0.07);

  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: inner,
          height: inner,
          backgroundColor: colors.bg,
          borderColor: selected ? theme.colors.focus : colors.border,
          borderWidth,
          borderRadius: status === 'available' ? inner / 2 : status === 'unknown' ? 3 : s * 0.12,
          transform: isDiamond ? [{ rotate: '45deg' }] : undefined,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      >
        <View style={{ transform: isDiamond ? [{ rotate: '-45deg' }] : undefined }}>
          <MaterialCommunityIcons name={STATUS_ICON[status]} size={s * 0.55} color={colors.fg} />
        </View>
      </View>
      {community ? (
        <View
          style={{
            position: 'absolute',
            right: -2,
            top: -2,
            width: s * 0.38,
            height: s * 0.38,
            borderRadius: s * 0.19,
            backgroundColor: theme.colors.primary,
            borderWidth: 1.5,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="account-group" size={s * 0.24} color={theme.colors.onPrimary} />
        </View>
      ) : null}
    </View>
  );
}

export function StatusBadge({ status, label, large }: { status: AvailabilityStatus; label: string; large?: boolean }) {
  const theme = useTheme();
  const colors = theme.colors.status[status];
  const fontSize = large ? theme.font.title : theme.font.small;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.space(2),
        backgroundColor: colors.bg,
        borderRadius: 999,
        paddingLeft: 4,
        paddingRight: theme.space(3),
        paddingVertical: 4,
        borderWidth: theme.highContrast ? 2 : 0,
        borderColor: colors.border,
      }}
    >
      <StatusIcon status={status} size={fontSize * 1.5} />
      <Text style={{ color: colors.fg, fontWeight: '800', fontSize }}>{label.toUpperCase()}</Text>
    </View>
  );
}
