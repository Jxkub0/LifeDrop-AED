import type { TrackUserLocation } from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../components/BottomSheet';
import { AedMap, UK_CENTER, type AedMapHandle, type RegionInfo } from '../components/map/AedMap';
import { buildFeatures, NO_QUICK_FILTERS, passesFilters, type AedFeatureCollection, type QuickFilters } from '../components/map/features';
import { LayersSheet } from '../components/map/LayersSheet';
import { MainMenu } from '../components/map/MainMenu';
import { EmergencyFab, Fab, FilterChip, StatusPill } from '../components/map/MapControls';
import { MapKey } from '../components/map/MapKey';
import { SearchBar } from '../components/map/SearchBar';
import { NearbyHeader, NearbyList, SelectedActions, SelectedBody, SelectedHeader } from '../components/map/SheetContent';
import { useMapStyle } from '../components/map/useMapStyle';
import { BigButton } from '../components/ui';
import { annotate } from '../lib/nearest';
import type { Bounds } from '../lib/osm';
import type { DefibWithMeta, LatLng } from '../lib/types';
import { readJson, writeJson } from '../services/storage';
import { useDefibs } from '../state/DefibContext';
import { useFindNearest, useVoiceGuidance } from '../state/hooks';
import { useSettings } from '../state/SettingsContext';
import { useDirections } from '../state/useDirections';

const LAST_VIEW_KEY = 'lastView.v2';
const EMPTY: AedFeatureCollection = { type: 'FeatureCollection', features: [] };

interface SavedView {
  center: LatLng;
  zoom: number;
}

interface NearestInfo {
  id: string;
  warning?: string;
  altId?: string;
}

/** Full-screen map – the Standard home screen, and "Show the map" from Easy view. */
export function MapScreen({ asHome = false }: { asHome?: boolean }) {
  const { settings, theme } = useSettings();
  const insets = useSafeAreaInsets();
  const {
    all,
    statusOf,
    nearby,
    nearUser,
    userLocation,
    loadArea,
    loading,
    booting,
    notice,
    refreshAll,
    requestLocation,
    getDefib,
    now,
    holidayLookup,
  } = useDefibs();
  const { run: runFindNearest, busy: finding } = useFindNearest();
  const directions = useDirections();
  const { shownId, note: mapNote } = useMapStyle();
  const mapRef = useRef<AedMapHandle>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nearestInfo, setNearestInfo] = useState<NearestInfo | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [follow, setFollow] = useState<TrackUserLocation | null>(null);
  const [quick, setQuick] = useState<QuickFilters>(NO_QUICK_FILTERS);
  const [layersOpen, setLayersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [height, setHeight] = useState(0);
  const [view, setView] = useState<SavedView>(
    () => readJson<SavedView>(LAST_VIEW_KEY) ?? { center: UK_CENTER, zoom: 5.2 },
  );
  const [initialView] = useState<SavedView>(() =>
    userLocation ? { center: userLocation, zoom: 15 } : (readJson<SavedView>(LAST_VIEW_KEY) ?? { center: UK_CENTER, zoom: 5.2 }),
  );
  const centeredOnUser = useRef(!!userLocation);
  const regionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------------- layout ---------------- */
  const pillHeight = theme.easy ? 64 : 52;
  const chipsHeight = theme.easy ? 0 : 36 + 10;
  const topInset = insets.top + 8 + pillHeight + chipsHeight + 8;
  const H = height || 700;
  const snaps = useMemo(() => {
    const peek = theme.easy ? 176 : 132;
    const half = Math.max(peek + 120, Math.round(H * 0.47));
    const full = Math.max(half + 60, H - (insets.top + pillHeight + 16));
    return [peek, half, full];
  }, [H, theme.easy, insets.top, pillHeight]);
  const sheetHeight = snaps[Math.min(sheetIndex, snaps.length - 1)];
  const mapInsets = useMemo(
    () => ({ top: topInset, bottom: Math.min(sheetHeight, snaps[1]) }),
    [topInset, sheetHeight, snaps],
  );

  /* ---------------- map data (rebuilt only when something visible changes) ---------------- */
  const filterOpts = useMemo(
    () => ({
      showClosed: settings.showClosed,
      showUnknown: settings.showUnknown,
      showRestricted: settings.showRestricted,
      quick,
    }),
    [settings.showClosed, settings.showUnknown, settings.showRestricted, quick],
  );
  const [features, setFeatures] = useState<AedFeatureCollection>(EMPTY);
  const lastBuild = useRef<{ all: unknown; opts: unknown; sig: string } | null>(null);
  useEffect(() => {
    // Availability is re-checked every minute; only resend the map data if a status actually changed.
    let sig = '';
    for (const d of all) sig += statusOf(d)[0];
    const prev = lastBuild.current;
    if (prev && prev.all === all && prev.opts === filterOpts && prev.sig === sig) return;
    lastBuild.current = { all, opts: filterOpts, sig };
    setFeatures(buildFeatures(all, statusOf, filterOpts));
  }, [all, statusOf, filterOpts]);

  /* ---------------- selection ---------------- */
  const selected = selectedId ? getDefib(selectedId) : undefined;
  const readAloud = useVoiceGuidance(selected);
  const selectedMarker = useMemo(
    () =>
      selected
        ? { id: selected.id, latitude: selected.latitude, longitude: selected.longitude, status: selected.availability.status }
        : null,
    [selected],
  );

  const select = useCallback(
    (id: string | null, opts: { fly?: boolean; info?: NearestInfo | null } = {}) => {
      setSelectedId(id);
      setNearestInfo(opts.info ?? null);
      if (id) {
        setSheetIndex(1);
        const d = getDefib(id);
        if (d && opts.fly) mapRef.current?.flyTo(d, 16.5);
      } else {
        setSheetIndex(0);
      }
    },
    [getDefib],
  );

  // Keep the screen on while an emergency result is showing.
  useEffect(() => {
    if (!nearestInfo || !settings.keepAwake) return;
    activateKeepAwakeAsync('nearest').catch(() => undefined);
    return () => {
      deactivateKeepAwake('nearest').catch(() => undefined);
    };
  }, [nearestInfo, settings.keepAwake]);

  /* ---------------- first GPS fix: centre on the user once ---------------- */
  useEffect(() => {
    if (userLocation && !centeredOnUser.current) {
      centeredOnUser.current = true;
      mapRef.current?.flyTo(userLocation, 15);
    }
  }, [userLocation]);

  /* ---------------- Android back button ---------------- */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) {
        select(null);
        return true;
      }
      if (sheetIndex > 0) {
        setSheetIndex(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selectedId, sheetIndex, select]);

  const onRegionChange = useCallback(
    (r: RegionInfo) => {
      if (regionTimer.current) clearTimeout(regionTimer.current);
      regionTimer.current = setTimeout(() => {
        const v = { center: r.center, zoom: r.zoom };
        writeJson(LAST_VIEW_KEY, v);
        setView(v);
        if (r.zoom >= 11) loadArea(r.bounds as Bounds);
      }, 450);
    },
    [loadArea],
  );

  /* ---------------- actions ---------------- */
  const findNearest = async () => {
    if (settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    const out = await runFindNearest();
    if (!out?.result.best) return;
    const best = out.result.best;
    if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    select(best.id, {
      info: {
        id: best.id,
        warning: out.result.usedUnconfirmed
          ? 'No defibrillator with confirmed opening hours was found nearby. This one may be locked or inside a closed building.'
          : out.result.closerUnconfirmed
            ? `There is a closer one (${Math.round(out.result.closerUnconfirmed.distanceM ?? 0)} m away) but its opening hours are not confirmed.`
            : undefined,
        altId: out.result.closerUnconfirmed?.id,
      },
    });
    mapRef.current?.fitTo([out.from, best]);
  };

  const goToMe = async () => {
    if (follow === 'default') {
      setFollow(settings.northUp ? null : 'heading');
      return;
    }
    if (follow === 'heading') {
      setFollow(null);
      mapRef.current?.resetNorth();
      return;
    }
    const p = userLocation ?? (await requestLocation());
    if (!p) {
      Alert.alert('Location unavailable', 'Allow location access in your phone settings, or search for a postcode.');
      return;
    }
    mapRef.current?.flyTo(p, Math.max(view.zoom, 15.5));
    setFollow('default');
  };

  const toggleQuick = (k: keyof QuickFilters) => setQuick((q) => ({ ...q, [k]: !q[k] }));

  /* ---------------- sheet list ---------------- */
  const listItems = useMemo<DefibWithMeta[]>(() => {
    const ok = (d: DefibWithMeta) => passesFilters(d, d.availability.status, filterOpts);
    if (userLocation) return nearUser.filter(ok).slice(0, 40);
    if (view.zoom < 11) return [];
    const radius = Math.min(15_000, 40_000 / 2 ** (view.zoom - 11));
    return nearby(view.center, radius, 80).filter(ok).slice(0, 40);
  }, [userLocation, nearUser, nearby, view, filterOpts]);
  const walkable = userLocation ? listItems.filter((d) => (d.distanceM ?? 0) <= 1500) : listItems;
  const availableCount = walkable.filter((d) => d.availability.status === 'available').length;

  const searchDefibs = useCallback(
    (q: string) => {
      const needle = q.toLowerCase();
      const from = userLocation ?? view.center;
      const hits: DefibWithMeta[] = [];
      for (const d of all) {
        const hay = `${d.name ?? ''} ${d.operator ?? ''} ${d.locationDescription ?? ''} ${d.address ?? ''}`.toLowerCase();
        if (hay.includes(needle)) hits.push(annotate(d, now, holidayLookup, from));
      }
      return hits.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)).slice(0, 6);
    },
    [all, userLocation, view.center, now, holidayLookup],
  );

  const statusNote = mapNote ?? notice;
  const darkMap = shownId === 'dark' || shownId === 'satellite' || shownId === 'hybrid';
  const showFloating = sheetIndex < snaps.length - 1 && !searchFocused;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style={searchFocused ? (theme.dark || theme.highContrast ? 'light' : 'dark') : darkMap || theme.highContrast ? 'light' : 'dark'} />

      <AedMap
        ref={mapRef}
        testID="aed-map"
        features={features}
        selected={selectedMarker}
        onSelect={(id) => select(id, { fly: false })}
        onPressMap={() => (selectedId ? select(null) : sheetIndex > 0 ? setSheetIndex(0) : undefined)}
        onLongPress={(p) =>
          Alert.alert('Add a defibrillator here?', 'You can drop a pin exactly where the cabinet is on the next screen.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add here',
              onPress: () => router.push({ pathname: '/add', params: { lat: String(p.latitude), lng: String(p.longitude) } }),
            },
          ])
        }
        onRegionChange={onRegionChange}
        initialCenter={initialView.center}
        initialZoom={initialView.zoom}
        insets={mapInsets}
        showUser={!!userLocation}
        follow={follow}
        onFollowChange={setFollow}
      />

      {/* Top: search bar, filter chips, status */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: searchFocused ? 0 : undefined }}
      >
        <SearchBar
          leftIcon={asHome ? 'menu' : 'arrow-left'}
          leftLabel={asHome ? 'Menu' : 'Back'}
          onLeftPress={() => (asHome ? setMenuOpen(true) : router.back())}
          onPickLocation={(p) => {
            select(null);
            setFollow(null);
            mapRef.current?.flyTo(p, 15);
          }}
          onPickDefib={(d) => select(d.id, { fly: true })}
          searchDefibs={searchDefibs}
          userLocation={userLocation}
          onFocusChange={setSearchFocused}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
        {!searchFocused ? (
          <View pointerEvents="box-none" style={{ gap: 8, marginTop: 10 }}>
            {!theme.easy ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 2 }}
                style={{ flexGrow: 0 }}
              >
                <FilterChip label="Available now" icon="check-circle-outline" active={quick.openNow} onPress={() => toggleQuick('openNow')} />
                <FilterChip label="24/7" icon="clock-outline" active={quick.allDay} onPress={() => toggleQuick('allDay')} />
                <FilterChip label="No code needed" icon="lock-open-outline" active={quick.noCode} onPress={() => toggleQuick('noCode')} />
                <FilterChip label="Map key" icon="map-legend" active={false} onPress={() => setKeyOpen(true)} />
                <FilterChip label="Add AED" icon="plus" active={false} onPress={() => router.push('/add')} />
              </ScrollView>
            ) : null}
            <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, gap: 8 }}>
              <View pointerEvents="box-none" style={{ flex: 1, gap: 6 }}>
                {booting ? <StatusPill icon="progress-download" text="Loading defibrillators…" /> : null}
                {!booting && loading ? <StatusPill icon="sync" text="Updating defibrillator list…" /> : null}
                {statusNote ? (
                  <StatusPill icon="cloud-off-outline" text={statusNote} onPress={notice && !mapNote ? () => refreshAll() : undefined} />
                ) : null}
              </View>
              <Fab icon="layers-outline" label="Layers" onPress={() => setLayersOpen(true)} testID="layers-button" />
            </View>
          </View>
        ) : null}
      </View>

      {/* Bottom sheet with nearby list or the selected defibrillator */}
      {!searchFocused ? (
        <BottomSheet
          testID="results-sheet"
          snaps={snaps}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          floating={
            showFloating ? (
              <View
                pointerEvents="box-none"
                style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', padding: 12, gap: 12 }}
              >
                <View pointerEvents="box-none" style={{ alignItems: 'flex-end', gap: 12 }}>
                  <Fab
                    testID="my-location"
                    icon={follow === 'heading' ? 'compass' : follow ? 'crosshairs-gps' : 'crosshairs'}
                    label="My location"
                    active={!!follow}
                    onPress={goToMe}
                  />
                  {!selected ? (
                    <EmergencyFab
                      testID="find-closest-available"
                      label={finding ? 'Finding…' : theme.easy ? 'Nearest defibrillator' : 'Nearest AED'}
                      busy={finding}
                      onPress={findNearest}
                    />
                  ) : null}
                </View>
              </View>
            ) : null
          }
          header={
            selected ? (
              <>
                <SelectedHeader
                  defib={selected}
                  heading={nearestInfo?.id === selected.id ? 'Closest available defibrillator' : undefined}
                  onClose={() => select(null)}
                />
                <SelectedActions
                  defib={selected}
                  onDirections={() => directions.open(selected, selected.name)}
                  onReadAloud={readAloud}
                />
              </>
            ) : (
              <NearbyHeader count={walkable.length} available={availableCount} located={!!userLocation} />
            )
          }
        >
          {selected ? (
            <SelectedBody
              defib={selected}
              warning={nearestInfo?.id === selected.id ? nearestInfo.warning : undefined}
              onShowAlt={
                nearestInfo?.id === selected.id && nearestInfo.altId
                  ? () => select(nearestInfo.altId!, { fly: true })
                  : undefined
              }
            />
          ) : (
            <NearbyList
              items={listItems}
              onSelect={(d) => select(d.id, { fly: true })}
              footer={
                <View style={{ padding: 16, gap: 10 }}>
                  {!userLocation ? (
                    <BigButton label="Use my location" icon="crosshairs-gps" variant="primary" size="compact" onPress={goToMe} />
                  ) : null}
                  <BigButton label="See full list" icon="format-list-bulleted" variant="secondary" size="compact" onPress={() => router.push('/nearby')} />
                  <BigButton
                    label="Add a missing defibrillator"
                    icon="plus-circle-outline"
                    variant="secondary"
                    size="compact"
                    onPress={() => router.push('/add')}
                  />
                </View>
              }
            />
          )}
        </BottomSheet>
      ) : null}

      <LayersSheet visible={layersOpen} onClose={() => setLayersOpen(false)} />
      <MainMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onShowKey={() => setKeyOpen(true)} />
      <MapKey visible={keyOpen} onClose={() => setKeyOpen(false)} />
      {directions.picker}
    </View>
  );
}
