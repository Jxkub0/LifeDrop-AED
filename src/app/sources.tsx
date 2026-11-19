import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { AppText, BigButton, Group, LinkRow, Notice, Screen, ToggleRow } from '../components/ui';
import type { FeedConfig } from '../lib/sources/feeds';
import { cloudEnabled } from '../services/cloud';
import { deleteFeedCache, getFeedStatuses, getUserFeeds, saveUserFeeds } from '../services/feeds';
import { useDefibs } from '../state/DefibContext';
import { useSettings } from '../state/SettingsContext';

function when(ms?: number): string {
  if (!ms) return 'never';
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hours ago`;
  return new Date(ms).toLocaleDateString('en-GB');
}

/** Where the defibrillators on the map come from, and extra open-data feeds. */
export default function Sources() {
  const { settings, update, theme } = useSettings();
  const c = theme.colors;
  const { sources, refreshAll, refreshFeed, dropFeed, online } = useDefibs();
  const [updating, setUpdating] = useState(false);
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const statuses = getFeedStatuses();
  const n = sources.national;

  const toggleFeed = (id: string, enabled: boolean) => {
    const set = new Set(settings.disabledFeeds);
    if (enabled) set.delete(id);
    else set.add(id);
    update({ disabledFeeds: Array.from(set) });
  };

  const addFeed = async () => {
    const url = feedUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      Alert.alert('Check the address', 'Enter the full https:// link to a GeoJSON or CSV file.');
      return;
    }
    const feed: FeedConfig = {
      id: `user${Date.now().toString(36)}`,
      name: feedName.trim() || new URL(url).hostname,
      url,
      format: 'auto',
    };
    setAdding(true);
    saveUserFeeds([...getUserFeeds(), feed]);
    try {
      const count = await refreshFeed(feed);
      setFeedName('');
      setFeedUrl('');
      Alert.alert('Feed added', `${count} defibrillators found. Any already on the map are merged, not shown twice.`);
    } catch (e) {
      saveUserFeeds(getUserFeeds().filter((f) => f.id !== feed.id));
      dropFeed(feed.id);
      Alert.alert('Could not use that feed', e instanceof Error ? e.message : 'Download failed');
    } finally {
      setAdding(false);
    }
  };

  const removeFeed = (feed: FeedConfig) =>
    Alert.alert(`Remove ${feed.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          saveUserFeeds(getUserFeeds().filter((f) => f.id !== feed.id));
          deleteFeedCache(feed.id);
          dropFeed(feed.id);
        },
      },
    ]);

  return (
    <Screen contentStyle={{ gap: theme.space(5) }}>
      <View style={{ gap: theme.space(1) }}>
        <AppText variant="title">{sources.total.toLocaleString()} defibrillators</AppText>
        <AppText muted>
          Combined from the sources below. {sources.duplicatesMerged ? `${sources.duplicatesMerged} listed by more than one source are shown once.` : ''}
        </AppText>
      </View>

      <Group title="OpenStreetMap (national)">
        <View style={{ flexDirection: 'row', gap: theme.space(3), paddingVertical: theme.space(2) }}>
          <MaterialCommunityIcons name="map-check-outline" size={28} color={c.textMuted} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText bold>{n ? `${n.count.toLocaleString()} defibrillators` : 'Loading…'}</AppText>
            <AppText variant="small" muted>
              {n
                ? `${n.origin === 'bundled' ? 'Copy included with the app' : 'Downloaded'} · data from ${new Date(n.updatedAt).toLocaleDateString('en-GB')} · checked ${when(n.checkedAt)}`
                : ''}
            </AppText>
            {sources.nationalError ? (
              <AppText variant="small" color={c.emergency}>
                Last update failed: {sources.nationalError}
              </AppText>
            ) : null}
            <AppText variant="small" muted>
              Every UK defibrillator mapped on OpenStreetMap, packaged daily by OpenAEDMap. Saved on your phone so it works with no
              signal. © OpenStreetMap contributors (ODbL).
            </AppText>
          </View>
        </View>
        <BigButton
          label="Check for updates now"
          icon="refresh"
          variant="secondary"
          size="compact"
          loading={updating || sources.nationalLoading}
          disabled={!online}
          onPress={async () => {
            setUpdating(true);
            await refreshAll();
            setUpdating(false);
          }}
        />
        <ToggleRow
          icon="lightning-bolt-outline"
          label="Live updates for the area you view"
          description="Also asks OpenStreetMap directly, so units added in the last few minutes appear. Uses more data."
          value={settings.liveOsmUpdates}
          onValueChange={(v) => update({ liveOsmUpdates: v })}
        />
        <LinkRow icon="open-in-new" label="Add or fix a defibrillator on OpenAEDMap" onPress={() => WebBrowser.openBrowserAsync('https://openaedmap.org/')} />
      </Group>

      <Group title="Added by app users">
        <AppText style={{ paddingVertical: theme.space(2) }}>
          {sources.communityCount.toLocaleString()} {sources.communityCount === 1 ? 'defibrillator' : 'defibrillators'}
          {cloudEnabled ? ' shared by people using this app.' : ' on this phone (cloud sharing is not set up in this build).'}
        </AppText>
        <ToggleRow icon="account-group-outline" label="Show on the map" value={settings.showCommunity} onValueChange={(v) => update({ showCommunity: v })} />
      </Group>

      <Group title="Council open data">
        <ToggleRow icon="database-outline" label="Show on the map" value={settings.showFeeds} onValueChange={(v) => update({ showFeeds: v })} />
        {sources.feeds.map(({ feed, count, enabled }) => {
          const st = statuses[feed.id];
          return (
            <View key={feed.id} style={{ paddingVertical: theme.space(2), gap: theme.space(1), borderTopWidth: 1, borderTopColor: c.border }}>
              <ToggleRow
                label={feed.name}
                description={[
                  feed.note,
                  `${count} listed`,
                  st?.fetchedAt ? `updated ${when(st.fetchedAt)}` : null,
                  st?.error ? `last download failed (${st.error})` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={enabled}
                onValueChange={(v) => toggleFeed(feed.id, v)}
              />
              {feed.licence ? (
                <AppText variant="small" muted>
                  {feed.licence}
                </AppText>
              ) : null}
              {!feed.builtIn ? (
                <BigButton label="Remove feed" icon="delete-outline" variant="secondary" size="compact" onPress={() => removeFeed(feed)} />
              ) : null}
            </View>
          );
        })}
        <View style={{ gap: theme.space(2), paddingVertical: theme.space(3), borderTopWidth: 1, borderTopColor: c.border }}>
          <AppText bold>Add a feed</AppText>
          <AppText variant="small" muted>
            Paste a link to a GeoJSON or CSV list of defibrillators – for example your council’s open data. CSV files need
            latitude/longitude or easting/northing columns.
          </AppText>
          <TextInput
            value={feedName}
            onChangeText={setFeedName}
            placeholder="Name (e.g. My council)"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Feed name"
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
          <TextInput
            value={feedUrl}
            onChangeText={setFeedUrl}
            placeholder="https://…"
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Feed web address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
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
          <BigButton label="Add feed" icon="plus" size="compact" loading={adding} disabled={!online || !feedUrl.trim()} onPress={addFeed} />
        </View>
      </Group>

      <Group title="Other registers">
        <View style={{ paddingVertical: theme.space(2), gap: theme.space(2) }}>
          <AppText bold>The Circuit (British Heart Foundation)</AppText>
          <AppText variant="small">
            The national defibrillator network used by NHS ambulance services. Its data is not openly licensed, so it cannot be
            shown in this app – but 999 call handlers can see every registered defibrillator and give you the cabinet code.
          </AppText>
          <Notice text="In a cardiac emergency, always call 999 first." />
        </View>
        <LinkRow
          icon="open-in-new"
          label="Search DefibFinder"
          description="The British Heart Foundation’s public map of The Circuit"
          onPress={() => WebBrowser.openBrowserAsync('https://www.defibfinder.uk/')}
        />
      </Group>
    </Screen>
  );
}
