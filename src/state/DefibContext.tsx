import { NetworkStateType, useNetworkState } from 'expo-network';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateAvailability } from '../lib/availability';
import { config } from '../lib/config';
import { mergeSources } from '../lib/dedupe';
import { haversineMeters } from '../lib/geo';
import { guessRegion, makeHolidayLookup, regionFromCountry, type HolidayTable, type UKRegion } from '../lib/holidays';
import { annotate, findNearestAvailable, nearbyDefibs, type HolidayLookup, type NearestResult } from '../lib/nearest';
import { tilesForBounds, type Bounds } from '../lib/osm';
import { fetchDefibsForTiles } from '../lib/overpass';
import { lookupCountry } from '../lib/search';
import type { FeedConfig } from '../lib/sources/feeds';
import type { AvailabilityStatus, Defibrillator, DefibWithMeta, LatLng } from '../lib/types';
import { cloudEnabled, fetchCommunityNear } from '../services/cloud';
import * as db from '../services/db';
import { feedIsStale, fetchFeed, getAllFeeds, loadCachedFeed } from '../services/feeds';
import {
  getCurrentLocation,
  getPermissionState,
  requestPermission,
  watchLocation,
  type PermissionState,
} from '../services/location';
import {
  getNationalMeta,
  loadNationalData,
  nationalDataIsStale,
  refreshNationalData,
  type NationalMeta,
} from '../services/nationalData';
import { setSpeechRate } from '../services/speech';
import { loadHolidayTable, loadRegion, refreshHolidayTable, saveRegion } from '../services/storage';
import { createSubmission, syncPendingSubmissions, type NewDefibInput } from '../services/submissions';
import { useSettings } from './SettingsContext';

const TILES_PER_REQUEST = 6;
const COMMUNITY_RADIUS_M = 15_000;

export type FindNearestOutcome =
  | { ok: true; result: NearestResult; from: LatLng }
  | { ok: false; reason: 'no-permission' | 'no-location' };

export interface SourceSummary {
  national: NationalMeta | null;
  nationalLoading: boolean;
  nationalError: string | null;
  feeds: { feed: FeedConfig; count: number; enabled: boolean }[];
  communityCount: number;
  liveCount: number;
  duplicatesMerged: number;
  total: number;
}

interface DefibContextValue {
  userLocation: LatLng | null;
  permission: PermissionState;
  /** Every defibrillator from every enabled source, duplicates merged. */
  all: Defibrillator[];
  /** Availability of any record right now (cached per minute). */
  statusOf: (d: Defibrillator) => AvailabilityStatus;
  /** Nearest units to the user (or a given point), annotated, nearest first. */
  nearby: (center?: LatLng | null, radiusM?: number, limit?: number) => DefibWithMeta[];
  /** Units near the user, refreshed as they move. */
  nearUser: DefibWithMeta[];
  now: Date;
  holidayLookup: HolidayLookup;
  /** True until the national dataset has loaded from the phone. */
  booting: boolean;
  loading: boolean;
  /** Shown when data could not be refreshed (offline / server busy). */
  notice: string | null;
  online: boolean;
  sources: SourceSummary;
  requestLocation: () => Promise<LatLng | null>;
  /** Called when the visible map area changes (live OSM edits + community additions). */
  loadArea: (bounds: Bounds) => Promise<boolean>;
  loadAround: (center: LatLng, radiusM: number) => Promise<void>;
  findNearest: () => Promise<FindNearestOutcome>;
  getDefib: (id: string) => DefibWithMeta | undefined;
  ensureDefibLoaded: (id: string) => Promise<void>;
  addDefib: (input: NewDefibInput) => Promise<Defibrillator>;
  /** Re-download everything now. */
  refreshAll: () => Promise<void>;
  /** Re-download one feed (after the user adds or edits it). */
  refreshFeed: (feed: FeedConfig) => Promise<number>;
  /** Forget a feed's records (after it is deleted). */
  dropFeed: (id: string) => void;
}

const DefibContext = createContext<DefibContextValue | null>(null);

/**
 * Availability for many records at one moment. Most records share the same
 * access/hours/indoor combination, so results are cached by that signature.
 */
function makeStatusFn(now: Date, holidayLookup: HolidayLookup) {
  const cache = new Map<string, AvailabilityStatus>();
  return (d: Defibrillator): AvailabilityStatus => {
    const key = `${d.access ?? ''}|${d.openingHours ?? ''}|${d.indoor ?? ''}`;
    let s = cache.get(key);
    if (!s) {
      s = evaluateAvailability(d, now, holidayLookup).status;
      cache.set(key, s);
    }
    return s;
  };
}

export function DefibProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  /* ---------------- per-source data ---------------- */
  const [national, setNational] = useState<Defibrillator[]>([]);
  const [nationalMeta, setNationalMeta] = useState<NationalMeta | null>(() => getNationalMeta());
  const [nationalLoading, setNationalLoading] = useState(true);
  const [nationalError, setNationalError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [live, setLive] = useState<Map<string, Defibrillator>>(() => new Map());
  const [community, setCommunity] = useState<Map<string, Defibrillator>>(() => new Map());
  const [feedData, setFeedData] = useState<Record<string, Defibrillator[]>>({});
  const [feedList, setFeedList] = useState<FeedConfig[]>(() => getAllFeeds());

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const userLocationRef = useRef<LatLng | null>(null);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [now, setNow] = useState(() => new Date());
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [holidayTable, setHolidayTable] = useState<HolidayTable>(() => loadHolidayTable());
  const [region, setRegion] = useState<UKRegion | null>(() => loadRegion());

  const network = useNetworkState();
  const online = network.isInternetReachable !== false && network.isConnected !== false;
  const onWifi = network.type === NetworkStateType.WIFI || network.type === NetworkStateType.ETHERNET;
  const mayDownload = online && (!settings.updateOnWifiOnly || onWifi);

  const loadedTiles = useRef(new Set<string>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const lastCommunityFetch = useRef<{ at: number; center: LatLng } | null>(null);
  const regionChecked = useRef(false);
  const lastFixAt = useRef(0);

  useEffect(() => setSpeechRate(settings.speechRate), [settings.speechRate]);

  /* ---------------- clock: availability changes over time ---------------- */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ---------------- startup: everything from the phone first ---------------- */
  useEffect(() => {
    let cancelled = false;
    getPermissionState().then(setPermission).catch(() => undefined);
    refreshHolidayTable().then((t) => t && setHolidayTable(t));
    loadNationalData()
      .then((data) => {
        if (cancelled || !data) return;
        setNational(data.defibs);
        setNationalMeta(data.meta);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setNationalLoading(false);
          setBooting(false);
        }
      });
    db.getDefibsBySource(['community'])
      .then((list) => !cancelled && setCommunity(new Map(list.map((d) => [d.id, d]))))
      .catch(() => undefined);
    Promise.all(getAllFeeds().map(async (f) => [f.id, await loadCachedFeed(f)] as const))
      .then((entries) => !cancelled && setFeedData(Object.fromEntries(entries)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- background refresh (daily, only if changed) ---------------- */
  const nationalMetaRef = useRef(nationalMeta);
  useEffect(() => {
    nationalMetaRef.current = nationalMeta;
  }, [nationalMeta]);

  const refreshNational = useCallback(async (force = false) => {
    if (!force && !nationalDataIsStale(nationalMetaRef.current)) return;
    setNationalLoading(true);
    const out = await refreshNationalData(nationalMetaRef.current);
    setNationalLoading(false);
    if (out.status === 'updated') {
      setNational(out.data.defibs);
      setNationalMeta(out.data.meta);
      setNationalError(null);
    } else if (out.status === 'not-modified') {
      setNationalMeta(out.meta);
      setNationalError(null);
    } else {
      setNationalError(out.message);
    }
  }, []);

  const disabledFeeds = settings.disabledFeeds;
  const refreshFeeds = useCallback(
    async (force = false) => {
      const feeds = getAllFeeds();
      setFeedList(feeds);
      await Promise.all(
        feeds
          .filter((f) => !disabledFeeds.includes(f.id) && (force || feedIsStale(f)))
          .map(async (f) => {
            try {
              const list = await fetchFeed(f);
              setFeedData((prev) => ({ ...prev, [f.id]: list }));
            } catch {
              // status recorded by the service; cached copy stays in use
            }
          }),
      );
    },
    [disabledFeeds],
  );

  const autoUpdate = settings.autoUpdateData;
  useEffect(() => {
    if (booting || !mayDownload || !autoUpdate) return;
    // Let the map draw and settle first (the check is usually a tiny "not modified" reply,
    // but a full update briefly keeps the phone busy).
    const t = setTimeout(() => {
      refreshNational(false);
      refreshFeeds(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [booting, mayDownload, autoUpdate, refreshNational, refreshFeeds]);

  useEffect(() => {
    if (online) syncPendingSubmissions().catch(() => undefined);
  }, [online]);

  /* ---------------- location ---------------- */
  useEffect(() => {
    if (permission !== 'granted') return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    getCurrentLocation({ maxAgeMs: 5 * 60_000 }).then((p) => !cancelled && p && setUserLocation(p));
    watchLocation((p) => {
      lastFixAt.current = Date.now();
      setUserLocation(p);
    })
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [permission]);

  // Work out which UK nation we're in (bank holidays differ) once per session.
  useEffect(() => {
    if (!userLocation || regionChecked.current) return;
    regionChecked.current = true;
    lookupCountry(userLocation).then((country) => {
      const r = regionFromCountry(country) ?? (region ? null : guessRegion(userLocation));
      if (r) {
        setRegion(r);
        saveRegion(r);
      }
    });
  }, [userLocation, region]);

  const holidayLookup = useMemo(
    () => makeHolidayLookup(region ?? (userLocation ? guessRegion(userLocation) : 'england-and-wales'), holidayTable),
    [region, userLocation, holidayTable],
  );

  const requestLocation = useCallback(async () => {
    // In an emergency every second counts: reuse a live fix from the last 30 seconds.
    if (userLocationRef.current && Date.now() - lastFixAt.current < 30_000) return userLocationRef.current;
    let perm = await getPermissionState().catch(() => 'undetermined' as PermissionState);
    if (perm !== 'granted') perm = await requestPermission().catch(() => 'denied' as PermissionState);
    setPermission(perm);
    if (perm !== 'granted') return null;
    const p = await getCurrentLocation({ maxAgeMs: 20_000 });
    if (p) {
      lastFixAt.current = Date.now();
      setUserLocation(p);
    }
    return p;
  }, []);

  /* ---------------- merged view of every source ---------------- */
  const { all, byId, duplicatesMerged } = useMemo(() => {
    // Live OpenStreetMap edits replace the national copy of the same object.
    const osm = new Map<string, Defibrillator>();
    for (const d of national) osm.set(d.id, d);
    for (const d of live.values()) osm.set(d.id, d);
    const extras: Defibrillator[][] = [Array.from(community.values())];
    for (const f of feedList) {
      if (!disabledFeeds.includes(f.id) && feedData[f.id]) extras.push(feedData[f.id]);
    }
    const { merged, duplicates } = mergeSources(osm.values(), extras);
    return { all: Array.from(merged.values()), byId: merged, duplicatesMerged: duplicates };
  }, [national, live, community, feedData, feedList, disabledFeeds]);

  /* ---------------- availability, cached per minute ---------------- */
  const statusOf = useMemo(() => makeStatusFn(now, holidayLookup), [now, holidayLookup]);

  /* ---------------- live OSM edits (optional) ---------------- */
  const replaceTiles = useCallback((fresh: Defibrillator[]) => {
    if (!fresh.length) return;
    setLive((prev) => {
      const next = new Map(prev);
      for (const d of fresh) next.set(d.id, d);
      return next;
    });
  }, []);

  const ensureTiles = useCallback(
    async (keys: string[]) => {
      const notLoaded = keys.filter((k) => !loadedTiles.current.has(k));
      if (notLoaded.length) {
        const local = await db.getDefibsForTiles(notLoaded).catch(() => []);
        notLoaded.forEach((k) => loadedTiles.current.add(k));
        replaceTiles(local.filter((d) => d.source === 'osm'));
      }
      const times = await db.getTileTimes(keys).catch(() => ({}) as Record<string, number>);
      const toFetch = keys.filter(
        (k) => (!times[k] || Date.now() - times[k] > config.cacheFreshMs) && !inflight.current.has(k),
      );
      for (let i = 0; i < toFetch.length; i += TILES_PER_REQUEST) {
        const chunk = toFetch.slice(i, i + TILES_PER_REQUEST);
        const job = (async () => {
          setPending((n) => n + 1);
          try {
            const fresh = await fetchDefibsForTiles(chunk, {
              endpoints: config.overpassEndpoints,
              userAgent: config.userAgent,
            });
            await db.saveTileDefibs(chunk, fresh).catch(() => undefined);
            replaceTiles(fresh);
            setNotice(null);
          } catch {
            setNotice('Live OpenStreetMap updates are unavailable right now – showing the national list.');
          } finally {
            setPending((n) => n - 1);
            chunk.forEach((k) => inflight.current.delete(k));
          }
        })();
        chunk.forEach((k) => inflight.current.set(k, job));
      }
    },
    [replaceTiles],
  );

  const ensureCommunity = useCallback(
    async (center: LatLng) => {
      if (!cloudEnabled || !online || !settings.showCommunity) return;
      const last = lastCommunityFetch.current;
      if (last && Date.now() - last.at < 10 * 60_000 && haversineMeters(last.center, center) < 3000) return;
      lastCommunityFetch.current = { at: Date.now(), center };
      try {
        const list = await fetchCommunityNear(center, COMMUNITY_RADIUS_M);
        await db.upsertDefibs(list).catch(() => undefined);
        if (list.length) {
          setCommunity((prev) => {
            const next = new Map(prev);
            for (const d of list) next.set(d.id, { ...d, syncStatus: prev.get(d.id)?.syncStatus });
            return next;
          });
        }
      } catch {
        lastCommunityFetch.current = null;
      }
    },
    [online, settings.showCommunity],
  );

  const liveOsm = settings.liveOsmUpdates;
  const loadArea = useCallback(
    async (bounds: Bounds) => {
      ensureCommunity({
        latitude: (bounds.north + bounds.south) / 2,
        longitude: (bounds.east + bounds.west) / 2,
      });
      if (!liveOsm || !mayDownload) return true;
      const tiles = tilesForBounds(bounds);
      if (!tiles) return false;
      await ensureTiles(tiles);
      return true;
    },
    [ensureTiles, ensureCommunity, liveOsm, mayDownload],
  );

  const loadAround = useCallback(
    async (center: LatLng, radiusM: number) => {
      ensureCommunity(center);
      if (!liveOsm || !mayDownload) return;
      const tiles = tilesForBounds(
        {
          south: center.latitude - radiusM / 111_320,
          north: center.latitude + radiusM / 111_320,
          west: center.longitude - radiusM / 70_000,
          east: center.longitude + radiusM / 70_000,
        },
        40,
      );
      if (tiles) ensureTiles(tiles); // national data is already here – never wait for this
    },
    [ensureTiles, ensureCommunity, liveOsm, mayDownload],
  );

  const refreshAll = useCallback(async () => {
    lastCommunityFetch.current = null;
    if (userLocation) ensureCommunity(userLocation);
    const keys = Array.from(loadedTiles.current);
    if (keys.length && liveOsm) ensureTiles(keys);
    await Promise.all([refreshNational(true), refreshFeeds(true)]);
  }, [ensureTiles, ensureCommunity, userLocation, refreshNational, refreshFeeds, liveOsm]);

  const refreshFeed = useCallback(async (feed: FeedConfig) => {
    setFeedList(getAllFeeds());
    const list = await fetchFeed(feed);
    setFeedData((prev) => ({ ...prev, [feed.id]: list }));
    return list.length;
  }, []);

  const dropFeed = useCallback((id: string) => {
    setFeedList(getAllFeeds());
    setFeedData((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /* ---------------- filtering by user settings ---------------- */
  const visible = useMemo(
    () =>
      all.filter(
        (d) =>
          (settings.showCommunity || d.source !== 'community' || d.syncStatus != null) &&
          (settings.showFeeds || d.source !== 'feed'),
      ),
    [all, settings.showCommunity, settings.showFeeds],
  );

  /* ---------------- emergency: find closest available ---------------- */
  const radiusM = Math.max(1, settings.searchRadiusKm) * 1000;
  const findNearest = useCallback(async (): Promise<FindNearestOutcome> => {
    const from = await requestLocation();
    if (!from) {
      const perm = await getPermissionState().catch(() => 'denied' as PermissionState);
      return { ok: false, reason: perm === 'granted' ? 'no-location' : 'no-permission' };
    }
    const at = new Date();
    loadAround(from, radiusM);
    let result = findNearestAvailable(visible, from, at, holidayLookup, radiusM);
    if (!result.best) {
      // Nothing usable within walking distance – widen the search.
      const wide = Math.max(radiusM, config.nearestFallbackRadiusM);
      result = findNearestAvailable(visible, from, at, holidayLookup, wide);
    }
    return { ok: true, result, from };
  }, [requestLocation, loadAround, holidayLookup, visible, radiusM]);

  /* ---------------- lookups ---------------- */
  const nearby = useCallback(
    (center?: LatLng | null, r = 5000, limit = 100) => {
      const from = center ?? userLocationRef.current;
      if (!from) return [];
      return nearbyDefibs(visible, from, now, holidayLookup, r, limit);
    },
    [visible, now, holidayLookup],
  );

  const nearUser = useMemo(
    () => (userLocation ? nearbyDefibs(visible, userLocation, now, holidayLookup, 10_000, 60) : []),
    [visible, now, holidayLookup, userLocation],
  );

  const getDefib = useCallback(
    (id: string) => {
      const d = byId.get(id) ?? live.get(id);
      return d ? annotate(d, now, holidayLookup, userLocation) : undefined;
    },
    [byId, live, now, holidayLookup, userLocation],
  );

  const ensureDefibLoaded = useCallback(
    async (id: string) => {
      if (byId.has(id)) return;
      const d = await db.getDefibById(id).catch(() => null);
      if (!d) return;
      if (d.source === 'community') setCommunity((prev) => new Map(prev).set(d.id, d));
      else replaceTiles([d]);
    },
    [byId, replaceTiles],
  );

  const addDefib = useCallback(async (input: NewDefibInput) => {
    const d = await createSubmission(input);
    setCommunity((prev) => new Map(prev).set(d.id, d));
    syncPendingSubmissions()
      .then(async () => {
        const fresh = await db.getDefibById(d.id);
        if (fresh) setCommunity((prev) => new Map(prev).set(fresh.id, fresh));
      })
      .catch(() => undefined);
    return d;
  }, []);

  const sources: SourceSummary = useMemo(
    () => ({
      national: nationalMeta,
      nationalLoading,
      nationalError,
      feeds: feedList.map((feed) => ({
        feed,
        count: feedData[feed.id]?.length ?? 0,
        enabled: !disabledFeeds.includes(feed.id),
      })),
      communityCount: community.size,
      liveCount: live.size,
      duplicatesMerged,
      total: all.length,
    }),
    [nationalMeta, nationalLoading, nationalError, feedList, feedData, disabledFeeds, community, duplicatesMerged, all, live],
  );

  let shownNotice = notice;
  if (!online) shownNotice = 'You are offline. Every defibrillator saved on this phone is still shown.';

  const value: DefibContextValue = {
    userLocation,
    permission,
    all: visible,
    statusOf,
    nearby,
    nearUser,
    now,
    holidayLookup,
    booting,
    loading: pending > 0 || nationalLoading,
    notice: shownNotice,
    online,
    sources,
    requestLocation,
    loadArea,
    loadAround,
    findNearest,
    getDefib,
    ensureDefibLoaded,
    addDefib,
    refreshAll,
    refreshFeed,
    dropFeed,
  };

  return <DefibContext.Provider value={value}>{children}</DefibContext.Provider>;
}

export function useDefibs(): DefibContextValue {
  const ctx = useContext(DefibContext);
  if (!ctx) throw new Error('useDefibs must be used inside DefibProvider');
  return ctx;
}
