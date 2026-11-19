import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatMinutes } from '../lib/openingHours';
import { useTheme } from '../state/SettingsContext';
import { AppText } from './ui';

const DAY = 1440;
const wrap = (m: number) => ((m % DAY) + DAY) % DAY;

function StepButton({ text, a11yLabel, onPress }: { text: string; a11yLabel: string; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: theme.touch,
        minHeight: theme.touch,
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius,
        borderWidth: 2,
        borderColor: c.border,
        backgroundColor: pressed ? c.surfaceAlt : c.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text style={{ color: c.text, fontWeight: '800', fontSize: theme.font.small }}>{text}</Text>
    </Pressable>
  );
}

/**
 * Large, accessible time picker: a big read-out with labelled buttons for
 * 15-minute and 1-hour steps. Works with screen readers as an adjustable control.
 */
export function TimeStepper({
  label,
  value,
  onChange,
  allowMidnightEnd,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
  /** Show 24:00 instead of 00:00 (for closing times). */
  allowMidnightEnd?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const display = allowMidnightEnd && (value === 0 || value === DAY) ? '24:00' : formatMinutes(value);
  const step = (delta: number) => {
    const next = wrap(value + delta);
    onChange(allowMidnightEnd && next === 0 ? DAY : next);
  };

  return (
    <View style={{ gap: theme.space(1) }}>
      <AppText variant="small" bold>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
        <StepButton text="−1 h" a11yLabel={`${label}: one hour earlier`} onPress={() => step(-60)} />
        <StepButton text="−15" a11yLabel={`${label}: 15 minutes earlier`} onPress={() => step(-15)} />
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: display }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 15 : -15)}
          style={{ flex: 1, alignItems: 'center' }}
        >
          <Text style={{ color: c.text, fontSize: theme.font.title, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {display}
          </Text>
        </View>
        <StepButton text="+15" a11yLabel={`${label}: 15 minutes later`} onPress={() => step(15)} />
        <StepButton text="+1 h" a11yLabel={`${label}: one hour later`} onPress={() => step(60)} />
      </View>
    </View>
  );
}
