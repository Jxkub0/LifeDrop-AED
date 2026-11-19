import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../state/SettingsContext';
import type { IconName } from '../ui';

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 6,
} as const;

/** Round floating map button. In Easy view it always shows its text label. */
export function Fab({
  icon,
  label,
  onPress,
  active,
  busy,
  showLabel,
  testID,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  busy?: boolean;
  showLabel?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const labelled = showLabel || theme.easy;
  const size = theme.easy ? 64 : 52;
  const fg = active ? c.primary : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          minWidth: size,
          height: size,
          borderRadius: labelled ? size / 2 : size / 2,
          paddingHorizontal: labelled ? theme.space(4) : 0,
          backgroundColor: pressed ? c.surface : c.background,
          borderWidth: theme.highContrast ? 2 : 0,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          ...shadow,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <MaterialCommunityIcons name={icon} size={theme.easy ? 30 : 24} color={fg} />}
      {labelled ? (
        <Text style={{ color: fg, fontWeight: '700', fontSize: theme.font.small }} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The big red "nearest defibrillator" action (Google-style extended FAB). */
export function EmergencyFab({
  label,
  onPress,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Finds the closest defibrillator that can be used right now and shows how to get there"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.easy ? 72 : 56,
        borderRadius: 999,
        paddingHorizontal: theme.space(5),
        backgroundColor: c.emergency,
        borderWidth: theme.highContrast ? 3 : 0,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
        ...shadow,
      })}
    >
      {busy ? (
        <ActivityIndicator color={c.onEmergency} />
      ) : (
        <MaterialCommunityIcons name="heart-flash" size={theme.easy ? 32 : 26} color={c.onEmergency} />
      )}
      <Text style={{ color: c.onEmergency, fontWeight: '800', fontSize: theme.easy ? theme.font.body : 17 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Filter chip (Google Maps style). */
export function FilterChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: theme.easy ? theme.touch : 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? (theme.highContrast ? c.focus : theme.dark ? '#33415A' : '#D3E3FD') : c.background,
        borderWidth: theme.highContrast ? 2 : active ? 0 : 1,
        borderColor: c.border,
        ...shadow,
        shadowOpacity: 0.15,
        elevation: 3,
      }}
    >
      {active ? (
        <MaterialCommunityIcons name="check" size={18} color={theme.highContrast ? '#000' : c.text} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={18} color={c.text} />
      ) : null}
      <Text style={{ color: theme.highContrast && active ? '#000' : c.text, fontWeight: '600', fontSize: theme.font.small }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small pill shown under the search bar ("Offline – showing saved map"). */
export function StatusPill({ text, icon, onPress }: { text: string; icon?: IconName; onPress?: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.highContrast ? '#000' : theme.dark ? '#2A2E33' : '#202124',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: theme.highContrast ? 2 : 0,
        borderColor: c.border,
        maxWidth: '100%',
        ...shadow,
      }}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={16} color="#FFFFFF" /> : null}
      <Text style={{ color: '#FFFFFF', fontSize: theme.font.small, flexShrink: 1 }} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}
