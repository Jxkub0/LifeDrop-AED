import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { AppText, BigButton, Group, LinkRow, Screen, Segmented, ToggleRow } from '../components/ui';
import { MAP_STYLES, type MapStyleId } from '../lib/mapStyles';
import { formatBytes } from '../lib/tileMath';
import { cloudEnabled } from '../services/cloud';
import { clearDownloadedData, listSubmissions, type SubmissionRow } from '../services/db';
import { what3wordsConfigured } from '../services/external';
import { clearMapCache } from '../services/mapEngine';
import { areasVersion, listAreas, subscribeAreas } from '../services/offlineMaps';
import { speak } from '../services/speech';
import { syncPendingSubmissions } from '../services/submissions';
import { useDefibs } from '../state/DefibContext';
import { openDefib } from '../state/hooks';
import { useSettings, type MapAppPref } from '../state/SettingsContext';

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return new Date(ms).toLocaleDateString('en-GB');
}

export default function Settings() {
  const { settings, update, reset, theme } = useSettings();
  const { refreshAll, online, sources } = useDefibs();
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useSyncExternalStore(subscribeAreas, areasVersion, areasVersion);
  const areas = listAreas();

  const loadSubs = useCallback(() => {
    listSubmissions().then(setSubs).catch(() => undefined);
  }, []);
  useEffect(loadSubs, [loadSubs]);

  const pending = subs.filter((s) => s.syncStatus !== 'synced').length;
  const mapApps: { value: MapAppPref; label: string }[] = [
    { value: 'ask', label: 'Ask each time' },
    { value: 'google', label: 'Google Maps' },
    ...(Platform.OS === 'ios' ? [{ value: 'apple' as const, label: 'Apple Maps' }] : []),
    { value: 'waze', label: 'Waze' },
  ];

  return (
    <Screen contentStyle={{ gap: theme.space(5) }}>
      <Group title="View">
        <Segmented
          label="Layout"
          description="Easy view has extra-large text and buttons and a big “Find nearest” button."
          value={settings.uiMode}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'easy', label: 'Easy' },
          ]}
          onChange={(v) => update({ uiMode: v, highContrast: v === 'easy' && settings.uiMode !== 'easy' ? true : settings.highContrast })}
        />
        <ToggleRow
          icon="contrast-circle"
          label="High-contrast colours"
          description="Black background, white text and bright buttons"
          value={settings.highContrast}
          onValueChange={(v) => update({ highContrast: v })}
        />
        <Segmented
          label="Theme"
          value={settings.themeMode}
          options={[
            { value: 'system', label: 'Match phone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(v) => update({ themeMode: v })}
        />
        <Segmented
          label="Text size"
          value={settings.textSize}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
            { value: 'xlarge', label: 'Extra large' },
          ]}
          onChange={(v) => update({ textSize: v })}
        />
        <Segmented
          label="Distances"
          value={settings.units}
          options={[
            { value: 'both', label: 'Metres & yards' },
            { value: 'metric', label: 'Metres / km' },
            { value: 'imperial', label: 'Yards / miles' },
          ]}
          onChange={(v) => update({ units: v })}
        />
      </Group>

      <Group title="Map">
        <Segmented<MapStyleId>
          label="Map type"
          value={settings.mapStyle}
          options={MAP_STYLES.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => update({ mapStyle: v })}
        />
        <ToggleRow icon="google-circles-communities" label="Group nearby markers" value={settings.clusterMarkers} onValueChange={(v) => update({ clusterMarkers: v })} />
        <ToggleRow icon="cube-outline" label="3D buildings" value={settings.buildings3d} onValueChange={(v) => update({ buildings3d: v })} />
        <ToggleRow icon="store-marker-outline" label="Shops and places" value={settings.showPoi} onValueChange={(v) => update({ showPoi: v })} />
        <ToggleRow icon="magnify-plus-outline" label="Larger markers" value={settings.largeMarkers} onValueChange={(v) => update({ largeMarkers: v })} />
        <ToggleRow
          icon="compass-outline"
          label="Keep north at the top"
          description="Stops the map turning when you twist two fingers"
          value={settings.northUp}
          onValueChange={(v) => update({ northUp: v })}
        />
        <ToggleRow icon="ruler" label="Scale bar" value={settings.showScaleBar} onValueChange={(v) => update({ showScaleBar: v })} />
        <LinkRow
          icon="download-circle-outline"
          label="Offline maps"
          description="Save maps for places with no signal"
          value={areas.length ? `${areas.length} saved` : undefined}
          onPress={() => router.push('/offline')}
        />
        <ToggleRow
          icon="sim-off-outline"
          label="Use saved maps when online"
          description="Saves mobile data in areas you have downloaded"
          value={settings.preferOfflineMaps}
          onValueChange={(v) => update({ preferOfflineMaps: v })}
        />
      </Group>

      <Group title="Show on the map">
        <ToggleRow icon="close-box-outline" label="Closed right now" value={settings.showClosed} onValueChange={(v) => update({ showClosed: v })} />
        <ToggleRow icon="help-rhombus-outline" label="Hours not confirmed" value={settings.showUnknown} onValueChange={(v) => update({ showUnknown: v })} />
        <ToggleRow icon="lock-outline" label="Private / staff only" value={settings.showRestricted} onValueChange={(v) => update({ showRestricted: v })} />
        <ToggleRow icon="account-group-outline" label="Added by app users" value={settings.showCommunity} onValueChange={(v) => update({ showCommunity: v })} />
        <ToggleRow icon="database-outline" label="Council open data" value={settings.showFeeds} onValueChange={(v) => update({ showFeeds: v })} />
      </Group>

      <Group title="Finding and directions">
        <Segmented
          label="Search distance for “Find nearest”"
          description="If nothing is open this close, the search widens to 10 km."
          value={settings.searchRadiusKm}
          options={[1, 2, 3, 5, 10].map((km) => ({ value: km, label: `${km} km` }))}
          onChange={(v) => update({ searchRadiusKm: v })}
        />
        <Segmented
          label="Getting there"
          value={settings.travelMode}
          options={[
            { value: 'walking', label: 'Walking' },
            { value: 'driving', label: 'Driving' },
          ]}
          onChange={(v) => update({ travelMode: v })}
        />
        <Segmented label="Directions app" value={settings.preferredMapApp} options={mapApps} onChange={(v) => update({ preferredMapApp: v })} />
      </Group>

      <Group title="Voice and alerts">
        <ToggleRow
          icon="account-voice"
          label="Voice guidance"
          description="Reads out distance, direction and cabinet code when you choose a defibrillator"
          value={settings.voiceGuidance}
          onValueChange={(v) => update({ voiceGuidance: v })}
        />
        <Segmented
          label="Speaking speed"
          value={settings.speechRate}
          options={[
            { value: 'slow', label: 'Slow' },
            { value: 'normal', label: 'Normal' },
            { value: 'fast', label: 'Fast' },
          ]}
          onChange={(v) => update({ speechRate: v })}
        />
        <BigButton
          label="Test voice"
          icon="volume-high"
          variant="secondary"
          size="compact"
          onPress={() => speak('Defibrillator available now. It is about 200 metres to the north. The cabinet code is 1, 2, 3, 4.')}
        />
        <ToggleRow icon="vibrate" label="Vibration" value={settings.haptics} onValueChange={(v) => update({ haptics: v })} />
        <ToggleRow
          icon="cellphone-lock"
          label="Keep screen on"
          description="While directions to a defibrillator are showing"
          value={settings.keepAwake}
          onValueChange={(v) => update({ keepAwake: v })}
        />
      </Group>

      <Group title="Defibrillator data">
        <LinkRow
          icon="database-sync-outline"
          label="Data sources"
          description={
            sources.national
              ? `${sources.total.toLocaleString()} defibrillators · updated ${ago(sources.national.updatedAt)}`
              : `${sources.total.toLocaleString()} defibrillators`
          }
          onPress={() => router.push('/sources')}
        />
        <ToggleRow
          icon="update"
          label="Update automatically"
          description="Checks for changes once a day (usually a few KB)"
          value={settings.autoUpdateData}
          onValueChange={(v) => update({ autoUpdateData: v })}
        />
        <ToggleRow icon="wifi" label="Only update on Wi-Fi" value={settings.updateOnWifiOnly} onValueChange={(v) => update({ updateOnWifiOnly: v })} />
        <BigButton
          label="Update now"
          icon="refresh"
          variant="secondary"
          size="compact"
          loading={refreshing}
          disabled={!online}
          onPress={async () => {
            setRefreshing(true);
            await refreshAll();
            setRefreshing(false);
          }}
        />
      </Group>

      <Group title="Your additions">
        <AppText style={{ paddingVertical: theme.space(2) }}>
          {cloudEnabled
            ? pending
              ? `${pending} waiting to be shared.`
              : subs.length
                ? 'All shared with other users.'
                : 'You have not added any defibrillators yet.'
            : 'Cloud sharing is not configured in this build – additions stay on this phone.'}
        </AppText>
        {subs.map((s) => (
          <LinkRow
            key={s.id}
            icon="map-marker-plus-outline"
            label={s.defib.locationDescription || 'Defibrillator'}
            description={`${new Date(s.createdAt).toLocaleDateString('en-GB')} · ${
              s.syncStatus === 'synced' ? 'Shared' : s.syncStatus === 'failed' ? 'Not sent yet – will retry' : 'Waiting to send'
            }`}
            onPress={() => openDefib(s.id)}
          />
        ))}
        {cloudEnabled && pending ? (
          <BigButton
            label="Send now"
            icon="cloud-upload"
            variant="secondary"
            size="compact"
            loading={syncing}
            onPress={async () => {
              setSyncing(true);
              const r = await syncPendingSubmissions().catch(() => ({ synced: 0, failed: pending }));
              setSyncing(false);
              loadSubs();
              if (r.failed) Alert.alert('Not sent yet', 'Some additions could not be sent. They will be retried automatically.');
            }}
          />
        ) : null}
        <LinkRow icon="plus-circle-outline" label="Add a defibrillator" onPress={() => router.push('/add')} />
      </Group>

      <Group title="Storage">
        <Segmented
          label="Recently viewed map cache"
          description="Areas you have looked at stay visible when the signal drops."
          value={settings.mapCacheMb}
          options={[50, 150, 300].map((mb) => ({ value: mb, label: formatBytes(mb * 1024 * 1024) }))}
          onChange={(v) => update({ mapCacheMb: v })}
        />
        <LinkRow
          icon="broom"
          label="Clear map cache"
          description="Does not delete saved offline maps"
          onPress={() =>
            clearMapCache()
              .then(() => Alert.alert('Done', 'The map cache has been cleared.'))
              .catch(() => Alert.alert('Could not clear the cache'))
          }
        />
        <LinkRow
          icon="delete-outline"
          label="Delete downloaded live updates"
          description="Your own additions and the national list are kept"
          onPress={() =>
            Alert.alert('Delete live updates?', 'Areas will be downloaded again the next time you view them online.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => clearDownloadedData() },
            ])
          }
        />
      </Group>

      <Group title="About">
        <View style={{ gap: theme.space(2), paddingVertical: theme.space(2) }}>
          <AppText>
            UK LifeDrop AED helps you find public access defibrillators. It is not a medical device and the information may be
            incomplete or out of date. In a cardiac emergency always call 999 first – the call handler can direct you to the
            nearest defibrillator and give you cabinet codes.
          </AppText>
          <AppText variant="small" muted>
            Defibrillators © OpenStreetMap contributors (ODbL), via OpenAEDMap. Council data contains public sector information
            licensed under the Open Government Licence v3.0. Map © OpenFreeMap, OpenMapTiles and OpenStreetMap contributors.
            Satellite imagery © Esri, Vantor/Maxar, Earthstar Geographics. Street View © Google; photos © Mapillary
            contributors. Postcode search by postcodes.io (contains OS data © Crown copyright). Bank holidays from GOV.UK.
            {what3wordsConfigured ? ' what3words addresses © what3words.' : ''}
          </AppText>
        </View>
        <LinkRow icon="open-in-new" label="OpenStreetMap copyright" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} />
        <LinkRow
          icon="hand-wave-outline"
          label="Show the welcome screen again"
          onPress={() => {
            update({ onboarded: false });
            router.replace('/onboarding');
          }}
        />
        <LinkRow
          icon="restore"
          label="Reset all settings"
          danger
          onPress={() =>
            Alert.alert('Reset settings?', 'Every option goes back to how it was when you installed the app. Saved maps and data are kept.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: reset },
            ])
          }
        />
        <AppText variant="small" muted style={{ paddingVertical: theme.space(2) }}>
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </AppText>
      </Group>
    </Screen>
  );
}
