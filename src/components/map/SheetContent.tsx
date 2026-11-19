import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import type { DefibWithMeta } from '../../lib/types';
import { call999 } from '../../services/external';
import { openDefib, openStreetViewScreen, shareDefib } from '../../state/hooks';
import { useSettings } from '../../state/SettingsContext';
import { defibTitle, distanceText, LockedNoCode, PinCode, useTravelTime } from '../DefibInfo';
import { StatusBadge, StatusIcon } from '../StatusIcon';
import { AppText, BigButton, Notice, type IconName } from '../ui';

/* ------------------------------------------------------------------ */
/* Action pills (Directions / Street View / Call 999 / …)             */
/* ------------------------------------------------------------------ */

function ActionPill({
  icon,
  label,
  onPress,
  primary,
  danger,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  const bg = primary ? c.primary : danger ? c.emergency : theme.dark ? '#2A2E33' : theme.highContrast ? '#000' : '#E8F0FE';
  const fg = primary ? c.onPrimary : danger ? c.onEmergency : theme.highContrast ? '#FFF' : theme.dark ? '#D2E3FC' : '#0B57D0';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: theme.easy ? theme.touch : 44,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: theme.highContrast ? 2 : 0,
        borderColor: c.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={theme.easy ? 26 : 20} color={fg} />
      <Text style={{ color: fg, fontWeight: '700', fontSize: theme.font.small }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Selected defibrillator                                              */
/* ------------------------------------------------------------------ */

export function SelectedHeader({
  defib,
  heading,
  onClose,
}: {
  defib: DefibWithMeta;
  heading?: string;
  onClose: () => void;
}) {
  const { theme, settings } = useSettings();
  const c = theme.colors;
  const travel = useTravelTime();
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          {heading ? (
            <Text style={{ color: c.emergency, fontWeight: '800', fontSize: theme.font.small, letterSpacing: 0.5 }}>
              {heading.toUpperCase()}
            </Text>
          ) : null}
          <AppText variant="title" numberOfLines={2} accessibilityRole="header">
            {defibTitle(defib)}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          style={{
            minWidth: theme.easy ? theme.touch : 40,
            height: theme.easy ? theme.touch : 40,
            borderRadius: 999,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            paddingHorizontal: theme.easy ? 12 : 0,
            gap: 4,
          }}
        >
          <MaterialCommunityIcons name="close" size={22} color={c.text} />
          {theme.easy ? <Text style={{ color: c.text, fontWeight: '700', fontSize: theme.font.small }}>Close</Text> : null}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <StatusBadge status={defib.availability.status} label={defib.availability.label} />
        {defib.distanceM != null ? (
          <Text style={{ color: c.text, fontSize: theme.font.body, fontWeight: '600' }}>
            {distanceText(defib.distanceM, settings.units)} · {travel(defib.distanceM)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function SelectedActions({
  defib,
  onDirections,
  onReadAloud,
}: {
  defib: DefibWithMeta;
  onDirections: () => void;
  onReadAloud: () => void;
}) {
  const { theme } = useSettings();
  const items = (
    <>
      <ActionPill testID="action-directions" primary icon="directions" label="Directions" onPress={onDirections} />
      <ActionPill testID="action-streetview" icon="google-street-view" label="Street View" onPress={() => openStreetViewScreen(defib)} />
      <ActionPill danger icon="phone" label="Call 999" onPress={() => call999()} />
      <ActionPill icon="volume-high" label="Read aloud" onPress={onReadAloud} />
      <ActionPill icon="share-variant" label="Share" onPress={() => shareDefib(defib)} />
      <ActionPill icon="information-outline" label="Details" onPress={() => openDefib(defib.id)} />
    </>
  );
  // Easy view wraps the buttons so every label is visible without scrolling sideways.
  return theme.easy ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>{items}</View>
  ) : (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}
    >
      {items}
    </ScrollView>
  );
}

function Line({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const { theme } = useSettings();
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 6 }}>
      <MaterialCommunityIcons name={icon} size={22} color={theme.colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export function SelectedBody({
  defib,
  warning,
  onShowAlt,
}: {
  defib: DefibWithMeta;
  warning?: string;
  onShowAlt?: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 8 }}>
      {warning ? <Notice tone="warning" text={warning} /> : null}
      {onShowAlt ? (
        <BigButton label="Show the closer one" icon="map-marker-question" variant="secondary" size="compact" onPress={onShowAlt} />
      ) : null}
      {defib.pinCode ? <PinCode code={defib.pinCode} compact /> : defib.locked ? <LockedNoCode /> : null}
      <Line icon="clock-outline">
        <AppText variant="body" bold>
          {defib.availability.detail}
        </AppText>
        {defib.openingHours && defib.openingHours !== '24/7' ? (
          <AppText variant="small" muted>
            Listed hours: {defib.openingHours}
          </AppText>
        ) : null}
      </Line>
      {defib.locationDescription ? (
        <Line icon="map-marker-outline">
          <AppText variant="body">{defib.locationDescription}</AppText>
        </Line>
      ) : null}
      {defib.address ? (
        <Line icon="home-outline">
          <AppText variant="body">{defib.address}</AppText>
        </Line>
      ) : null}
      {defib.level ? (
        <Line icon="stairs">
          <AppText variant="body">Floor {defib.level}</AppText>
        </Line>
      ) : null}
      <Line icon="database-outline">
        <AppText variant="small" muted>
          Source: {defib.sourceName ?? (defib.source === 'community' ? 'Added by an app user' : 'OpenStreetMap')}
          {defib.alsoIn?.length ? ` · also listed by ${defib.alsoIn.join(', ')}` : ''}
          {defib.checkDate ? ` · checked ${defib.checkDate}` : ''}
        </AppText>
      </Line>
      <BigButton label="Full details" icon="information-outline" variant="secondary" size="compact" onPress={() => openDefib(defib.id)} />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Nearby list                                                         */
/* ------------------------------------------------------------------ */

export function NearbyHeader({ count, available, located }: { count: number; available: number; located: boolean }) {
  const { theme } = useSettings();
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
      <AppText variant="large" bold accessibilityRole="header">
        {located ? 'Defibrillators near you' : 'Defibrillators in this area'}
      </AppText>
      <AppText variant="small" muted>
        {count
          ? `${count} within ${located ? 'walking distance' : 'view'} · ${available} available now`
          : theme.easy
            ? 'Move the map or search to see defibrillators'
            : 'None found here – zoom out or search a postcode'}
      </AppText>
    </View>
  );
}

function NearbyRow({ defib, onPress }: { defib: DefibWithMeta; onPress: () => void }) {
  const { theme, settings } = useSettings();
  const c = theme.colors;
  const travel = useTravelTime();
  const dist = defib.distanceM != null ? distanceText(defib.distanceM, settings.units) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[defibTitle(defib), defib.availability.label, dist, defib.locationDescription].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 20,
        paddingVertical: 12,
        minHeight: theme.touch + 8,
        backgroundColor: pressed ? c.surface : 'transparent',
      })}
    >
      <StatusIcon status={defib.availability.status} community={defib.source !== 'osm'} size={theme.easy ? 44 : 36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontSize: theme.font.body, fontWeight: '700' }} numberOfLines={1}>
          {defibTitle(defib)}
        </Text>
        <Text style={{ color: c.text, fontSize: theme.font.small }} numberOfLines={1}>
          {[dist, defib.distanceM != null ? travel(defib.distanceM) : null, defib.availability.label].filter(Boolean).join(' · ')}
        </Text>
        {defib.locationDescription ? (
          <Text style={{ color: c.textMuted, fontSize: theme.font.small }} numberOfLines={1}>
            {defib.locationDescription}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Separator() {
  const { theme } = useSettings();
  return <View style={{ height: 1, marginLeft: 70, backgroundColor: theme.colors.border, opacity: 0.5 }} />;
}

export function NearbyList({
  items,
  onSelect,
  footer,
}: {
  items: DefibWithMeta[];
  onSelect: (d: DefibWithMeta) => void;
  footer?: React.ReactElement;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <NearbyRow defib={item} onPress={() => onSelect(item)} />}
      ItemSeparatorComponent={Separator}
      ListFooterComponent={footer}
      initialNumToRender={8}
      windowSize={5}
    />
  );
}
