import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../state/SettingsContext';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

type Variant = 'small' | 'body' | 'large' | 'title' | 'huge';

export function AppText({
  variant = 'body',
  bold,
  muted,
  color,
  center,
  style,
  ...rest
}: TextProps & { variant?: Variant; bold?: boolean; muted?: boolean; color?: string; center?: boolean }) {
  const theme = useTheme();
  const size = theme.font[variant];
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          lineHeight: Math.round(size * 1.35),
          color: color ?? (muted ? theme.colors.textMuted : theme.colors.text),
          fontWeight: bold || variant === 'title' || variant === 'huge' ? '700' : '400',
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Buttons – every button has a visible text label (no icon-only).     */
/* ------------------------------------------------------------------ */

export type ButtonVariant = 'emergency' | 'primary' | 'secondary' | 'success';

export function BigButton({
  label,
  sublabel,
  icon,
  onPress,
  variant = 'primary',
  size = 'normal',
  loading,
  disabled,
  hint,
  style,
  testID,
}: {
  label: string;
  sublabel?: string;
  icon?: IconName;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'compact' | 'normal' | 'hero';
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    emergency: { bg: c.emergency, fg: c.onEmergency, border: theme.highContrast ? c.border : c.emergency },
    primary: { bg: c.primary, fg: c.onPrimary, border: theme.highContrast ? c.border : c.primary },
    secondary: { bg: c.secondary, fg: c.onSecondary, border: c.border },
    success: {
      bg: c.status.available.bg,
      fg: c.status.available.fg,
      border: theme.highContrast ? c.border : c.status.available.bg,
    },
  };
  const p = palette[variant];
  // Easy view: every touch target is at least 64 px tall (spec minimum 60).
  const minHeight =
    size === 'hero' ? theme.touch * 2.4 : size === 'compact' ? (theme.easy ? theme.touch : 44) : theme.touch;
  const baseFont = size === 'hero' ? theme.font.huge : size === 'compact' ? theme.font.small : theme.font.large;
  // Shrink the text just enough that the longest word fits on one line (never split mid-word).
  const [boxWidth, setBoxWidth] = useState(0);
  let fontSize = baseFont;
  if (boxWidth > 0) {
    const longest = label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1);
    const charWidth = label === label.toUpperCase() ? 0.68 : 0.6;
    const iconSpace = icon && size !== 'hero' ? baseFont * 1.25 + theme.space(2) : 0;
    const available = boxWidth - 2 * theme.space(4) - iconSpace - 4;
    fontSize = Math.max(16, Math.min(baseFont, Math.floor(available / (longest * charWidth))));
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={() => {
        if (variant === 'emergency') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
        onPress();
      }}
      hitSlop={6}
      onLayout={(e) => setBoxWidth(Math.round(e.nativeEvent.layout.width))}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: Math.max(theme.borderWidth, variant === 'secondary' ? 2 : 0),
          borderRadius: theme.radius,
          paddingHorizontal: theme.space(4),
          paddingVertical: size === 'hero' ? theme.space(4) : theme.space(2),
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          flexDirection: size === 'hero' ? 'column' : 'row',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size={size === 'hero' ? 'large' : 'small'} />
      ) : icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={size === 'hero' ? fontSize * 1.6 : fontSize * 1.25}
          color={p.fg}
          style={size === 'hero' ? { marginBottom: theme.space(2) } : { marginRight: theme.space(2) }}
        />
      ) : null}
      <View style={{ flexShrink: 1, alignItems: size === 'hero' || !icon ? 'center' : 'flex-start' }}>
        <Text
          style={{
            color: p.fg,
            fontSize,
            fontWeight: '800',
            textAlign: size === 'hero' || !icon ? 'center' : 'left',
            lineHeight: Math.round(fontSize * 1.25),
          }}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ color: p.fg, fontSize: theme.font.small, marginTop: 2, textAlign: size === 'hero' || !icon ? 'center' : 'left' }}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ children, contentStyle, ...rest }: ScrollViewProps & { contentStyle?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[{ padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(8) }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          padding: theme.space(4),
          gap: theme.space(2),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' }) {
  const theme = useTheme();
  const warning = tone === 'warning';
  const bg = warning ? theme.colors.status.unknown.bg : theme.colors.surfaceAlt;
  const fg = warning ? theme.colors.status.unknown.fg : theme.colors.text;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: theme.radius,
        borderWidth: theme.borderWidth,
        borderColor: theme.highContrast ? theme.colors.border : bg,
        padding: theme.space(3),
        gap: theme.space(2),
      }}
    >
      <MaterialCommunityIcons name={warning ? 'alert' : 'information'} size={theme.font.large} color={fg} />
      <Text style={{ color: fg, fontSize: theme.font.small, flex: 1, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  icon,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.touch,
        paddingVertical: theme.space(2),
        gap: theme.space(3),
      }}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={theme.font.title} color={theme.colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <AppText variant={theme.easy ? 'large' : 'body'} bold>
          {label}
        </AppText>
        {description ? (
          <AppText variant="small" muted>
            {description}
          </AppText>
        ) : null}
      </View>
      {theme.easy || theme.highContrast ? (
        <Text style={{ fontSize: theme.font.small, fontWeight: '700', color: theme.colors.text }}>{value ? 'On' : 'Off'}</Text>
      ) : null}
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.colors.status.available.bg, false: theme.colors.border }}
        thumbColor={theme.highContrast ? '#FFFFFF' : undefined}
        style={theme.easy ? { transform: [{ scale: 1.3 }] } : undefined}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function ChoiceCard({
  title,
  description,
  icon,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={{
        borderWidth: selected ? Math.max(3, theme.borderWidth) : theme.borderWidth,
        borderColor: selected ? (theme.highContrast ? c.focus : c.primary) : c.border,
        backgroundColor: selected ? c.surfaceAlt : c.surface,
        borderRadius: theme.radius,
        padding: theme.space(4),
        flexDirection: 'row',
        gap: theme.space(3),
        alignItems: 'flex-start',
        minHeight: theme.touch,
      }}
    >
      <MaterialCommunityIcons name={icon} size={theme.font.title} color={c.text} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="large" bold>
          {title}
        </AppText>
        <AppText variant="small" muted>
          {description}
        </AppText>
      </View>
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={theme.font.title}
        color={selected ? (theme.highContrast ? c.focus : c.primary) : c.textMuted}
      />
    </Pressable>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <AppText variant="title" accessibilityRole="header" style={style}>
      {children}
    </AppText>
  );
}

/** A row of mutually exclusive options (e.g. Metric / Imperial / Both). Wraps on narrow screens. */
export function Segmented<T extends string | number>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={{ paddingVertical: theme.space(2), gap: theme.space(2) }}>
      <View>
        <AppText variant={theme.easy ? 'large' : 'body'} bold>
          {label}
        </AppText>
        {description ? (
          <AppText variant="small" muted>
            {description}
          </AppText>
        ) : null}
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${label}: ${o.label}`}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: theme.easy ? theme.touch : 40,
                paddingHorizontal: theme.space(4),
                borderRadius: 999,
                justifyContent: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: selected ? (theme.highContrast ? c.focus : theme.dark ? '#33415A' : '#D3E3FD') : c.background,
                borderWidth: selected && !theme.highContrast ? 0 : theme.highContrast ? 2 : 1,
                borderColor: c.border,
              }}
            >
              {selected ? (
                <MaterialCommunityIcons name="check" size={16} color={theme.highContrast ? '#000' : c.text} />
              ) : null}
              <Text
                style={{
                  color: selected && theme.highContrast ? '#000' : c.text,
                  fontWeight: selected ? '700' : '500',
                  fontSize: theme.font.small,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Navigation row (icon, title, description, chevron). */
export function LinkRow({
  icon,
  label,
  description,
  onPress,
  value,
  danger,
}: {
  icon: IconName;
  label: string;
  description?: string;
  onPress: () => void;
  value?: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, value, description].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space(3),
        minHeight: theme.touch + 4,
        paddingVertical: theme.space(2),
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={theme.font.title} color={danger ? c.emergency : c.textMuted} />
      <View style={{ flex: 1 }}>
        <AppText variant={theme.easy ? 'large' : 'body'} bold color={danger ? c.emergency : undefined}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="small" muted>
            {description}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" muted>
          {value}
        </AppText>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={theme.font.title} color={c.textMuted} />
    </Pressable>
  );
}

/** Rounded group of settings rows (Android/Google settings style). */
export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: theme.space(1) }}>
      {title ? (
        <AppText variant="small" bold color={theme.highContrast ? c.text : c.primary} accessibilityRole="header" style={{ marginLeft: 4 }}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: theme.radius * 1.6,
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(1),
          borderWidth: theme.highContrast ? 2 : 0,
          borderColor: c.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
