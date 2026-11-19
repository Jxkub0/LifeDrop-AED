import { MaterialCommunityIcons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, View } from 'react-native';
import { DefibListItem, DistanceLine, LockedNoCode, PinCode, defibTitle } from '../../components/DefibInfo';
import { AedMap, type AedMapHandle } from '../../components/map/AedMap';
import type { AedFeatureCollection } from '../../components/map/features';
import { StatusBadge } from '../../components/StatusIcon';
import { AppText, BigButton, Card, Notice, Screen } from '../../components/ui';
import { describeWeek, parseOpeningHours } from '../../lib/openingHours';
import { telUrl } from '../../lib/links';
import { call999, getWhat3Words, openWhat3Words, what3wordsConfigured } from '../../services/external';
import { useDefibs } from '../../state/DefibContext';
import { openDefib, openStreetViewScreen, paramToId, shareDefib, useVoiceGuidance } from '../../state/hooks';
import { useSettings } from '../../state/SettingsContext';
import { useDirections } from '../../state/useDirections';

const NO_FEATURES: AedFeatureCollection = { type: 'FeatureCollection', features: [] };

export default function DefibDetail() {
  const params = useLocalSearchParams<{ id: string; emergency?: string; unconfirmed?: string; alt?: string }>();
  const id = paramToId(String(params.id));
  const altId = params.alt ? paramToId(String(params.alt)) : undefined;
  const emergency = params.emergency === '1';

  const { theme, settings } = useSettings();
  const { getDefib, ensureDefibLoaded, userLocation } = useDefibs();
  const directions = useDirections();
  const defib = getDefib(id);
  const alt = altId ? getDefib(altId) : undefined;
  const readAloud = useVoiceGuidance(defib);

  const [w3w, setW3w] = useState<{ id: string; words: string | null } | null>(null);
  const mapRef = useRef<AedMapHandle>(null);

  // Someone may be following these directions with the phone in hand – keep the screen on.
  useEffect(() => {
    if (!settings.keepAwake) return;
    activateKeepAwakeAsync('defib-detail').catch(() => undefined);
    return () => {
      deactivateKeepAwake('defib-detail').catch(() => undefined);
    };
  }, [settings.keepAwake]);

  useEffect(() => {
    ensureDefibLoaded(id);
    if (altId) ensureDefibLoaded(altId);
  }, [id, altId, ensureDefibLoaded]);

  // Resolve the what3words address up front so it can be read to the 999 call handler.
  const defibId = defib?.id;
  const defibLat = defib?.latitude;
  const defibLng = defib?.longitude;
  useEffect(() => {
    if (!defibId || defibLat === undefined || defibLng === undefined || !what3wordsConfigured) return;
    let cancelled = false;
    getWhat3Words(defibId, { latitude: defibLat, longitude: defibLng })
      .catch(() => null)
      .then((words) => {
        if (!cancelled) setW3w({ id: defibId, words });
      });
    return () => {
      cancelled = true;
    };
  }, [defibId, defibLat, defibLng]);
  const words = w3w && w3w.id === defibId ? w3w.words : null;
  const wordsLoading = what3wordsConfigured && Boolean(defibId) && w3w?.id !== defibId;

  // Frame both the user and the defibrillator on the mini map.
  useEffect(() => {
    if (!defib) return;
    const t = setTimeout(() => {
      if (userLocation && (defib.distanceM ?? Infinity) < 5000) mapRef.current?.fitTo([userLocation, defib]);
      else mapRef.current?.flyTo(defib, 16.5);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defib?.id, Boolean(userLocation)]);

  const hours = defib?.openingHours;
  const week = useMemo(() => (hours ? describeWeek(parseOpeningHours(hours)) : null), [hours]);
  const status = defib?.availability.status;
  const marker = useMemo(
    () => (defib && status ? { id: defib.id, latitude: defib.latitude, longitude: defib.longitude, status } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defib?.id, defib?.latitude, defib?.longitude, status],
  );

  if (!defib) {
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: theme.space(10) }}>
        <ActivityIndicator size="large" color={theme.colors.text} />
        <AppText>Loading…</AppText>
      </Screen>
    );
  }

  const title = defibTitle(defib);
  const osmUrl = defib.source === 'osm' ? `https://www.openstreetmap.org/${defib.id.replace('osm:', '')}` : null;

  return (
    <>
      <Stack.Screen options={{ title: emergency ? 'Nearest defibrillator' : 'Defibrillator' }} />
      <Screen>
        <StatusBadge status={defib.availability.status} label={defib.availability.label} large />
        <AppText variant="large" bold>
          {defib.availability.detail}
        </AppText>

        {params.unconfirmed === '1' ? (
          <Notice
            tone="warning"
            text="No defibrillator with confirmed opening hours was found nearby. This is the closest one – it may be locked or inside a closed building."
          />
        ) : null}
        {defib.availability.assumed ? (
          <Notice text="Opening hours are not listed. Outdoor cabinets are normally available 24 hours a day." />
        ) : null}

        <View
          style={{
            height: theme.easy ? 240 : 220,
            borderRadius: theme.radius,
            overflow: 'hidden',
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.border,
          }}
        >
          <AedMap
            ref={mapRef}
            preview
            features={NO_FEATURES}
            selected={marker}
            showUser={!!userLocation}
            initialCenter={defib}
            initialZoom={16.5}
          />
        </View>

        <DistanceLine defib={defib} large />

        {defib.pinCode ? <PinCode code={defib.pinCode} /> : defib.locked ? <LockedNoCode /> : null}

        <Card>
          <AppText variant="large" bold accessibilityRole="header">
            Where to find it
          </AppText>
          <AppText variant="large">{defib.locationDescription || 'No description has been added yet.'}</AppText>
          {defib.name ? <AppText muted>{title}</AppText> : null}
          {defib.address ? <AppText muted>{defib.address}</AppText> : null}
          {defib.level ? <AppText muted>Floor: {defib.level}</AppText> : null}
          {defib.indoor === true ? <AppText muted>Inside a building</AppText> : null}
          {defib.indoor === false ? <AppText muted>Outdoor cabinet</AppText> : null}
          {what3wordsConfigured ? (
            <AppText variant="large" bold accessibilityLabel={words ? `what3words address: ${words.split('.').join(', ')}` : undefined}>
              {wordsLoading ? 'Finding what3words address…' : words ? `///${words}` : ''}
            </AppText>
          ) : null}
        </Card>

        {defib.photoUrl ? (
          <Image
            source={{ uri: defib.photoUrl }}
            accessibilityLabel="Photo of the defibrillator cabinet"
            style={{ width: '100%', height: 220, borderRadius: theme.radius, backgroundColor: theme.colors.surface }}
            resizeMode="cover"
          />
        ) : null}

        <BigButton label="Get Directions (Map App)" icon="directions" onPress={() => directions.open(defib, title)} />
        <BigButton
          label="See Location in Street View"
          icon="google-street-view"
          variant="secondary"
          hint="Shows the street-level view of this spot inside the app"
          onPress={() => openStreetViewScreen(defib)}
        />
        <BigButton
          label="Open in what3words"
          sublabel={words ? `///${words}` : undefined}
          icon="grid"
          variant="secondary"
          onPress={() => openWhat3Words(defib, words)}
        />
        <BigButton label="Read details aloud" icon="volume-high" variant="secondary" onPress={readAloud} />
        <BigButton label="Share location" icon="share-variant" variant="secondary" onPress={() => shareDefib(defib)} />
        <BigButton label="Call 999" icon="phone" variant="emergency" onPress={() => call999()} />

        {alt ? (
          <View style={{ gap: theme.space(2) }}>
            <AppText variant="large" bold accessibilityRole="header">
              Closer, but hours not confirmed
            </AppText>
            <DefibListItem defib={alt} onPress={() => openDefib(alt.id)} />
          </View>
        ) : null}

        <Card>
          <AppText variant="large" bold accessibilityRole="header">
            Opening hours
          </AppText>
          {week ? (
            week.map((row) => (
              <View key={row.day} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(2) }}>
                <AppText bold>{row.day}</AppText>
                <AppText>{row.text}</AppText>
              </View>
            ))
          ) : (
            <AppText>{defib.openingHours ? `Listed as: ${defib.openingHours}` : 'Not recorded'}</AppText>
          )}
          {week && /PH/.test(defib.openingHours ?? '') ? (
            <AppText variant="small" muted>
              Different hours apply on bank holidays (listed as: {defib.openingHours}).
            </AppText>
          ) : null}
        </Card>

        {defib.phone ? (
          <BigButton
            label={`Call the site: ${defib.phone}`}
            icon="phone-outline"
            variant="secondary"
            onPress={() => Linking.openURL(telUrl(defib.phone!))}
          />
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'center' }}>
            <MaterialCommunityIcons
              name={defib.source === 'osm' ? 'map-check' : 'account-group'}
              size={theme.font.large}
              color={theme.colors.text}
            />
            <AppText variant="small" style={{ flex: 1 }}>
              {defib.source === 'osm'
                ? `From OpenStreetMap, © OpenStreetMap contributors${defib.checkDate ? ` – last checked ${defib.checkDate}` : ''}. Details may be out of date.`
                : defib.source === 'feed'
                  ? `From ${defib.sourceName ?? 'an open-data feed'}. Details may be out of date.`
                  : `Added by a community member${defib.createdAt ? ` on ${new Date(defib.createdAt).toLocaleDateString('en-GB')}` : ''}. Not yet verified.`}
              {defib.alsoIn?.length ? ` Also listed by ${defib.alsoIn.join(', ')}.` : ''}
            </AppText>
          </View>
          {defib.syncStatus === 'pending' || defib.syncStatus === 'failed' ? (
            <AppText variant="small" muted>
              Saved on this phone – it will be shared with other users when you are next online.
            </AppText>
          ) : null}
          {defib.contact ? <AppText variant="small">Contact: {defib.contact}</AppText> : null}
          {osmUrl ? (
            <BigButton
              label="Report a problem / edit on OpenStreetMap"
              icon="pencil"
              variant="secondary"
              size="compact"
              onPress={() => Linking.openURL(osmUrl)}
            />
          ) : null}
        </Card>
      </Screen>
      {directions.picker}
    </>
  );
}
