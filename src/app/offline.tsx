import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { AppText, BigButton, Group, Notice, Screen, Segmented } from '../components/ui';
import { lookupPlaceName, searchLocation } from '../lib/search';
import { boxAround, countTiles, estimateBytes, formatBytes } from '../lib/tileMath';
import type { LatLng } from '../lib/types';
import { deviceGeocode } from '../services/location';
import {
  areasVersion,
  deleteArea,
  downloadArea,
  listAreas,
  MAX_BYTES_PER_DOWNLOAD,
  MAX_TILES_PER_DOWNLOAD,
  OFFLINE_MAX_ZOOM,
  OFFLINE_MIN_ZOOM,
  offlineBytes,
  subscribeAreas,
  type DownloadProgress,
} from '../services/offlineMaps';
import { readJson } from '../services/storage';
import { useDefibs } from '../state/DefibContext';
import { useSettings } from '../state/SettingsContext';

type CenterChoice = 'me' | 'map' | 'search';

/** Download map areas for use with no signal. */
export default function OfflineMaps() {
  const { theme } = useSettings();
  const c = theme.colors;
  const { userLocation, online, requestLocation } = useDefibs();
  useSyncExternalStore(subscribeAreas, areasVersion, areasVersion);
  const areas = listAreas();
  const lastView = useMemo(() => readJson<{ center: LatLng; zoom: number }>('lastView.v2'), []);

  const [choice, setChoice] = useState<CenterChoice>(userLocation ? 'me' : lastView ? 'map' : 'search');
  const [radiusKm, setRadiusKm] = useState(5);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState<{ point: LatLng; label: string } | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  const center: LatLng | null =
    choice === 'me' ? userLocation : choice === 'map' ? (lastView?.center ?? null) : (searched?.point ?? null);

  const box = center ? boxAround(center.latitude, center.longitude, radiusKm * 1000) : null;
  const tiles = box ? countTiles(box, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM) : 0;
  const bytes = box ? estimateBytes(box, OFFLINE_MIN_ZOOM, OFFLINE_MAX_ZOOM) : 0;
  const tooBig = tiles > MAX_TILES_PER_DOWNLOAD;

  // Suggest a name for the area.
  const centerKey = center ? `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}` : '';
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    if (choice === 'search' && searched) {
      const t = setTimeout(() => setName(searched.label), 0);
      return () => clearTimeout(t);
    }
    lookupPlaceName(center).then((n) => {
      if (!cancelled && n) setName(n);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, choice]);

  const doSearch = async () => {
    const r = await searchLocation(query, { deviceGeocode });
    if (r) setSearched({ point: r, label: r.label });
    else Alert.alert('Not found', 'We could not find that postcode or place.');
  };

  const start = async () => {
    if (!box || !center) return;
    abort.current = new AbortController();
    setProgress({ done: 0, total: tiles, bytes: 0, phase: 'preparing' });
    try {
      const area = await downloadArea(
        { name: name.trim() || 'Saved area', box },
        (p) => setProgress(p),
        abort.current.signal,
      );
      Alert.alert(
        area.status === 'complete' ? 'Map saved' : 'Map partly saved',
        area.status === 'complete'
          ? `${area.name} (${formatBytes(area.bytes)}) is ready to use offline.`
          : 'The download stopped at the size limit or some tiles failed. What was saved can still be used – try a smaller area for the rest.',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Download failed';
      if (msg !== 'Download cancelled') Alert.alert('Download failed', msg);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Screen contentStyle={{ gap: theme.space(5) }}>
      <Notice text="Every defibrillator is already saved on your phone. Offline maps add the street map around them, for places with no signal." />

      <Group title="Saved areas">
        {areas.length ? (
          areas.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3), paddingVertical: theme.space(2) }}>
              <MaterialCommunityIcons name={a.status === 'complete' ? 'map-check-outline' : 'map-clock-outline'} size={28} color={c.textMuted} />
              <View style={{ flex: 1 }}>
                <AppText bold>{a.name}</AppText>
                <AppText variant="small" muted>
                  {formatBytes(a.bytes)} · {new Date(a.createdAt).toLocaleDateString('en-GB')}
                  {a.status === 'partial' ? ' · partly saved' : ''}
                </AppText>
              </View>
              <BigButton
                label="Delete"
                icon="delete-outline"
                variant="secondary"
                size="compact"
                onPress={() =>
                  Alert.alert(`Delete ${a.name}?`, 'You can download it again later.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteArea(a.id) },
                  ])
                }
              />
            </View>
          ))
        ) : (
          <AppText muted style={{ paddingVertical: theme.space(3) }}>
            No offline maps yet.
          </AppText>
        )}
        {areas.length ? (
          <AppText variant="small" muted style={{ paddingBottom: theme.space(2) }}>
            Using {formatBytes(offlineBytes())} of storage
          </AppText>
        ) : null}
      </Group>

      <Group title="Download a new area">
        <Segmented<CenterChoice>
          label="Centre on"
          value={choice}
          options={[
            { value: 'me', label: 'My location' },
            ...(lastView ? [{ value: 'map' as const, label: 'Last map view' }] : []),
            { value: 'search', label: 'A place' },
          ]}
          onChange={(v) => {
            setChoice(v);
            if (v === 'me' && !userLocation) requestLocation();
          }}
        />
        {choice === 'search' ? (
          <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'center', paddingBottom: theme.space(2) }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={doSearch}
              placeholder="Postcode or town"
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Postcode or town to download"
              returnKeyType="search"
              style={{
                flex: 1,
                minHeight: theme.touch,
                borderWidth: 1.5,
                borderColor: c.border,
                borderRadius: theme.radius,
                paddingHorizontal: theme.space(3),
                color: c.text,
                fontSize: theme.font.body,
                backgroundColor: c.background,
              }}
            />
            <BigButton label="Find" size="compact" onPress={doSearch} />
          </View>
        ) : null}
        {choice === 'me' && !userLocation ? <AppText muted>Waiting for your location…</AppText> : null}
        <Segmented
          label="Area size"
          value={radiusKm}
          options={[2, 5, 10, 20].map((km) => ({ value: km, label: `${km * 2} × ${km * 2} km` }))}
          onChange={setRadiusKm}
        />
        <View style={{ gap: theme.space(1), paddingVertical: theme.space(2) }}>
          <AppText bold>Name</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Home"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Name for this offline area"
            style={{
              minHeight: theme.touch,
              borderWidth: 1.5,
              borderColor: c.border,
              borderRadius: theme.radius,
              paddingHorizontal: theme.space(3),
              color: c.text,
              fontSize: theme.font.body,
              backgroundColor: c.background,
            }}
          />
        </View>
        {center ? (
          <AppText variant="small" muted>
            About {formatBytes(bytes)} ({tiles.toLocaleString()} map tiles). Countryside areas are much smaller than cities.
          </AppText>
        ) : null}
        {tooBig ? (
          <Notice tone="warning" text={`That is more than the ${MAX_TILES_PER_DOWNLOAD.toLocaleString()}-tile limit for one download. Choose a smaller size.`} />
        ) : bytes > MAX_BYTES_PER_DOWNLOAD ? (
          <Notice tone="warning" text="Large city areas may stop at the 50 MB per-download limit. You can download neighbouring areas separately." />
        ) : null}
        {progress ? (
          <View style={{ gap: theme.space(2), paddingVertical: theme.space(2) }}>
            <AppText bold>
              {progress.phase === 'preparing' ? 'Preparing…' : progress.phase === 'finishing' ? 'Finishing…' : `Downloading… ${pct}%`}
            </AppText>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: c.border, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.primary }} />
            </View>
            <AppText variant="small" muted>
              {formatBytes(progress.bytes)} downloaded
            </AppText>
            <BigButton label="Cancel" variant="secondary" size="compact" onPress={() => abort.current?.abort()} />
          </View>
        ) : (
          <View style={{ paddingVertical: theme.space(2) }}>
            <BigButton
              label="Download"
              icon="download"
              disabled={!center || tooBig || !online}
              onPress={start}
            />
          </View>
        )}
        {!online ? <AppText variant="small" muted>Connect to the internet to download maps.</AppText> : null}
        <AppText variant="small" muted style={{ paddingBottom: theme.space(2) }}>
          Street maps are saved; satellite photos cannot be saved for offline use. Maps © OpenFreeMap, © OpenStreetMap contributors.
        </AppText>
      </Group>
    </Screen>
  );
}
