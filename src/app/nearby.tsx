import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { DefibListItem } from '../components/DefibInfo';
import { AppText, BigButton, Notice } from '../components/ui';
import { useDefibs } from '../state/DefibContext';
import { openDefib } from '../state/hooks';
import { useSettings } from '../state/SettingsContext';


/** Plain list of nearby defibrillators – works well with screen readers and without map tiles. */
export default function Nearby() {
  const { theme, settings } = useSettings();
  const { nearUser, userLocation, requestLocation, loading, notice, refreshAll } = useDefibs();
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const radiusM = Math.max(2, settings.searchRadiusKm) * 1000;

  const list = useMemo(
    () =>
      nearUser
        .filter((d) => d.distanceM !== undefined && d.distanceM <= radiusM)
        .filter((d) => !onlyAvailable || d.availability.status === 'available')
        .slice(0, 50),
    [nearUser, onlyAvailable, radiusM],
  );

  const header = (
    <View style={{ gap: theme.space(3), marginBottom: theme.space(3) }}>
      <View style={{ flexDirection: 'row', gap: theme.space(2) }} accessibilityRole="radiogroup">
        <BigButton
          label="Available now"
          variant={onlyAvailable ? 'primary' : 'secondary'}
          size="compact"
          onPress={() => setOnlyAvailable(true)}
          style={{ flex: 1 }}
          hint={onlyAvailable ? 'Selected' : undefined}
        />
        <BigButton
          label="Show all"
          variant={!onlyAvailable ? 'primary' : 'secondary'}
          size="compact"
          onPress={() => setOnlyAvailable(false)}
          style={{ flex: 1 }}
          hint={!onlyAvailable ? 'Selected' : undefined}
        />
      </View>
      {notice ? <Notice tone="warning" text={notice} /> : null}
      {!userLocation ? (
        <>
          <Notice text="Turn on location to list the defibrillators closest to you." />
          <BigButton label="Use my location" icon="crosshairs-gps" onPress={() => requestLocation()} />
        </>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.space(4), gap: theme.space(2), paddingBottom: theme.space(8) }}
      data={userLocation ? list : []}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refreshAll()} tintColor={theme.colors.text} />}
      renderItem={({ item }) => <DefibListItem defib={item} onPress={() => openDefib(item.id)} />}
      ListEmptyComponent={
        userLocation && !loading ? (
          <AppText variant="large">
            {onlyAvailable
              ? `No defibrillators confirmed as available within ${radiusM / 1000} km. Tap “Show all” to include closed and unconfirmed ones, or call 999 for help.`
              : `No defibrillators recorded within ${radiusM / 1000} km.`}
          </AppText>
        ) : undefined
      }
    />
  );
}
