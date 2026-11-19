import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatDistance } from '../../lib/geo';
import { searchLocation, suggestLocations, type SearchSuggestion } from '../../lib/search';
import type { DefibWithMeta, LatLng } from '../../lib/types';
import { deviceGeocode } from '../../services/location';
import { readJson, writeJson } from '../../services/storage';
import { useSettings } from '../../state/SettingsContext';
import { defibTitle } from '../DefibInfo';
import { StatusIcon } from '../StatusIcon';
import type { IconName } from '../ui';

const RECENT_KEY = 'recentSearches.v1';

interface Recent extends LatLng {
  label: string;
}

function loadRecent(): Recent[] {
  return readJson<Recent[]>(RECENT_KEY) ?? [];
}

function pushRecent(r: Recent) {
  const list = [r, ...loadRecent().filter((x) => x.label !== r.label)].slice(0, 6);
  writeJson(RECENT_KEY, list);
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
  leading,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  leading?: React.ReactNode;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: theme.easy ? theme.touch + 8 : 58,
        paddingHorizontal: 16,
        backgroundColor: pressed ? c.surface : 'transparent',
      })}
    >
      {leading ?? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon ?? 'map-marker'} size={20} color={c.text} />
        </View>
      )}
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <Text style={{ color: c.text, fontSize: theme.font.body, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: c.textMuted, fontSize: theme.font.small }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Floating search box with as-you-type suggestions: places, postcodes and
 * defibrillators by name (e.g. "Tesco", "village hall").
 */
export function SearchBar({
  leftIcon,
  leftLabel,
  onLeftPress,
  onPickLocation,
  onPickDefib,
  searchDefibs,
  userLocation,
  onFocusChange,
  topInset,
  bottomInset,
}: {
  leftIcon: IconName;
  leftLabel: string;
  onLeftPress: () => void;
  onPickLocation: (p: LatLng, label: string) => void;
  onPickDefib: (d: DefibWithMeta) => void;
  searchDefibs: (q: string) => DefibWithMeta[];
  userLocation: LatLng | null;
  onFocusChange?: (focused: boolean) => void;
  topInset: number;
  bottomInset: number;
}) {
  const { theme, settings } = useSettings();
  const c = theme.colors;
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>(() => loadRecent());
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const reqId = useRef(0);

  useEffect(() => {
    onFocusChange?.(focused);
  }, [focused, onFocusChange]);

  // Debounced place/postcode suggestions.
  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    if (q.length < 2) {
      const t = setTimeout(() => setSuggestions([]), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      suggestLocations(q).then((list) => {
        if (id === reqId.current) setSuggestions(list);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const defibMatches = query.trim().length >= 3 ? searchDefibs(query.trim()).slice(0, 4) : [];

  const close = () => {
    Keyboard.dismiss();
    input.current?.blur();
    setFocused(false);
  };

  const pick = (p: LatLng, label: string) => {
    pushRecent({ ...p, label });
    setRecent(loadRecent());
    setQuery(label);
    close();
    onPickLocation(p, label);
  };

  const resolve = async (s: SearchSuggestion) => {
    if (s.point) return pick(s.point, s.label);
    setBusy(true);
    try {
      const r = await searchLocation(s.query, { deviceGeocode });
      if (r) pick(r, r.label);
      else Alert.alert('Not found', 'We could not find that postcode or place.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    if (suggestions[0]) return resolve(suggestions[0]);
    if (defibMatches[0]) {
      close();
      return onPickDefib(defibMatches[0]);
    }
    setBusy(true);
    try {
      const r = await searchLocation(q, { deviceGeocode });
      if (r) pick(r, r.label);
      else Alert.alert('Not found', 'We could not find that postcode or place. Check the spelling and try again.');
    } finally {
      setBusy(false);
    }
  };

  const pillHeight = theme.easy ? 64 : 52;

  return (
    <>
      {focused ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: c.background,
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: topInset + pillHeight + 20, paddingBottom: bottomInset + 20 }}
          >
            {userLocation && !query ? (
              <ResultRow icon="crosshairs-gps" title="Your location" onPress={() => pick(userLocation, 'Your location')} />
            ) : null}
            {defibMatches.map((d) => (
              <ResultRow
                key={d.id}
                leading={<StatusIcon status={d.availability.status} size={34} />}
                title={defibTitle(d)}
                subtitle={[
                  d.distanceM != null ? formatDistance(d.distanceM)[settings.units === 'imperial' ? 'imperial' : 'metric'] : null,
                  d.availability.label,
                  d.locationDescription,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => {
                  close();
                  onPickDefib(d);
                }}
              />
            ))}
            {suggestions.map((s) => (
              <ResultRow
                key={s.key}
                icon={s.kind === 'place' ? 'map-marker' : 'mailbox'}
                title={s.label}
                subtitle={s.sublabel}
                onPress={() => resolve(s)}
              />
            ))}
            {!query
              ? recent.map((r) => (
                  <ResultRow key={`r:${r.label}`} icon="history" title={r.label} onPress={() => pick(r, r.label)} />
                ))
              : null}
            {query.trim().length >= 2 && !suggestions.length && !defibMatches.length ? (
              <Text style={{ color: c.textMuted, padding: 16, fontSize: theme.font.small }}>
                Press search on the keyboard to look up “{query.trim()}”.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
      <View
        style={{
          marginTop: topInset + 8,
          marginHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          height: pillHeight,
          borderRadius: pillHeight / 2,
          backgroundColor: c.background,
          borderWidth: theme.highContrast ? 3 : 0,
          borderColor: c.border,
          paddingHorizontal: 4,
          shadowColor: '#000',
          shadowOpacity: focused ? 0 : 0.22,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: focused ? 0 : 7,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={focused ? 'Close search' : leftLabel}
          onPress={focused ? close : onLeftPress}
          hitSlop={6}
          style={{
            height: pillHeight - 8,
            minWidth: pillHeight - 8,
            borderRadius: (pillHeight - 8) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            paddingHorizontal: theme.easy ? 8 : 0,
            gap: 4,
          }}
        >
          <MaterialCommunityIcons name={focused ? 'arrow-left' : leftIcon} size={theme.easy ? 28 : 24} color={c.text} />
          {theme.easy && !focused ? (
            <Text style={{ color: c.text, fontWeight: '700', fontSize: theme.font.small }}>{leftLabel}</Text>
          ) : null}
        </Pressable>
        <TextInput
          ref={input}
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder={theme.easy ? 'Postcode or place' : 'Search postcode, place or AED'}
          placeholderTextColor={c.textMuted}
          accessibilityLabel="Search by postcode, place or defibrillator name"
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={submit}
          style={{ flex: 1, minWidth: 0, color: c.text, fontSize: theme.font.body, paddingHorizontal: 6, height: pillHeight }}
        />
        {busy ? <ActivityIndicator color={c.text} style={{ marginHorizontal: 10 }} /> : null}
        {query && !busy ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => {
              setQuery('');
              input.current?.focus();
            }}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <MaterialCommunityIcons name="close" size={22} color={c.text} />
          </Pressable>
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: c.emergency,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 2,
            }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <MaterialCommunityIcons name="heart-flash" size={22} color={c.onEmergency} />
          </View>
        )}
      </View>
    </>
  );
}
