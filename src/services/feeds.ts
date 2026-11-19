import { Directory, File, Paths } from 'expo-file-system';
import { config } from '../lib/config';
import { BUILT_IN_FEEDS, parseFeed, type FeedConfig } from '../lib/sources/feeds';
import type { Defibrillator } from '../lib/types';
import { readJson, writeJson } from './storage';

/**
 * Open-data feeds (council datasets and custom GeoJSON/CSV URLs).
 * Each feed is downloaded at most once a day and cached on the phone.
 */

const USER_FEEDS_KEY = 'feeds.user.v1';
const STATUS_KEY = 'feeds.status.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeedStatus {
  fetchedAt?: number;
  count?: number;
  error?: string;
  errorAt?: number;
}

function feedDir(): Directory {
  const dir = new Directory(Paths.document, 'feeds');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const cacheFile = (id: string) => new File(feedDir(), `${id.replace(/[^a-z0-9_-]/gi, '_')}.json`);

/** Feeds configured at build time with EXPO_PUBLIC_EXTRA_FEEDS. */
function buildFeeds(): FeedConfig[] {
  return config.extraFeeds.map((f, i) => ({
    id: `build${i + 1}`,
    name: f.name,
    url: f.url,
    format: 'auto',
    builtIn: true,
    note: 'Added by the app publisher',
  }));
}

export function getUserFeeds(): FeedConfig[] {
  return readJson<FeedConfig[]>(USER_FEEDS_KEY) ?? [];
}

export function saveUserFeeds(feeds: FeedConfig[]): void {
  writeJson(USER_FEEDS_KEY, feeds);
}

export function getAllFeeds(): FeedConfig[] {
  return [...BUILT_IN_FEEDS, ...buildFeeds(), ...getUserFeeds()];
}

export function getFeedStatuses(): Record<string, FeedStatus> {
  return readJson<Record<string, FeedStatus>>(STATUS_KEY) ?? {};
}

function setStatus(id: string, patch: FeedStatus) {
  const all = getFeedStatuses();
  all[id] = { ...all[id], ...patch };
  writeJson(STATUS_KEY, all);
}

/** Cached records for a feed (instant, offline). */
export async function loadCachedFeed(feed: FeedConfig): Promise<Defibrillator[]> {
  try {
    const f = cacheFile(feed.id);
    if (!f.exists) return [];
    const list = JSON.parse(await f.text()) as Defibrillator[];
    // Keep the display name in step if the user renamed the feed.
    return list.map((d) => ({ ...d, sourceName: feed.name }));
  } catch {
    return [];
  }
}

export function feedIsStale(feed: FeedConfig): boolean {
  const s = getFeedStatuses()[feed.id];
  const last = Math.max(s?.fetchedAt ?? 0, s?.errorAt ?? 0);
  return Date.now() - last > DAY_MS;
}

/** Download and parse a feed. Throws with a readable message on failure. */
export async function fetchFeed(feed: FeedConfig): Promise<Defibrillator[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/geo+json, application/json, text/csv, */*' },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const body = await res.text();
    const list = parseFeed(feed, body);
    const f = cacheFile(feed.id);
    if (!f.exists) f.create({ intermediates: true });
    await f.write(JSON.stringify(list));
    setStatus(feed.id, { fetchedAt: Date.now(), count: list.length, error: undefined, errorAt: undefined });
    return list;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Download failed';
    setStatus(feed.id, { error: message, errorAt: Date.now() });
    throw new Error(message);
  }
}

export function deleteFeedCache(id: string): void {
  try {
    const f = cacheFile(id);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
  const all = getFeedStatuses();
  delete all[id];
  writeJson(STATUS_KEY, all);
}
