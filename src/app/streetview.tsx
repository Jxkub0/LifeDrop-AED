import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { config } from '../lib/config';
import { streetViewUrl } from '../lib/links';
import { EMBED_ORIGIN, embedHtml, googleStreetViewEmbedUrl, mapillaryEmbedUrl, mapillaryWebUrl } from '../lib/streetView';
import { openStreetView } from '../services/external';
import { useTheme } from '../state/SettingsContext';

interface WebViewLikeProps {
  source: { html: string; baseUrl: string };
  style?: object;
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  allowsInlineMediaPlayback?: boolean;
  setSupportMultipleWindows?: boolean;
  onShouldStartLoadWithRequest?: (e: WebViewNavigation & { isTopFrame?: boolean }) => boolean;
  onLoadEnd?: () => void;
  onError?: () => void;
  testID?: string;
}
const TypedWebView = WebView as unknown as React.ComponentType<WebViewLikeProps>;

type Viewer = 'google' | 'mapillary';

function ViewerTab({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: theme.touch,
        borderRadius: 999,
        backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 10,
      }}
    >
      <MaterialCommunityIcons name={icon} size={theme.font.large} color={active ? '#0B0C0C' : '#FFFFFF'} />
      <Text style={{ color: active ? '#0B0C0C' : '#FFFFFF', fontWeight: '700', fontSize: theme.font.small }}>{label}</Text>
    </Pressable>
  );
}

/** Street-level view of a defibrillator's location, inside the app. */
export default function StreetViewScreen() {
  const theme = useTheme();
  const c = theme.colors;
  const params = useLocalSearchParams<{ lat: string; lng: string; title?: string; mly?: string }>();
  const point = useMemo(
    () => ({ latitude: Number(params.lat), longitude: Number(params.lng) }),
    [params.lat, params.lng],
  );
  const [viewer, setViewer] = useState<Viewer>('google');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const src = viewer === 'mapillary' && params.mly ? mapillaryEmbedUrl(params.mly) : googleStreetViewEmbedUrl(point, config.googleEmbedApiKey);
  const html = useMemo(() => embedHtml(src), [src]);

  // Links inside the viewer ("View on Google Maps", terms…) open outside the app.
  const onNav = (e: WebViewNavigation & { isTopFrame?: boolean }) => {
    const url = e.url;
    if (e.isTopFrame === false) return true;
    if (url === 'about:blank' || url.startsWith(EMBED_ORIGIN) || url.startsWith('data:')) return true;
    Linking.openURL(url).catch(() => undefined);
    return false;
  };

  const choose = (id: Viewer) => {
    setViewer(id);
    setLoading(true);
    setFailed(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Stack.Screen
        options={{
          title: params.title ? String(params.title) : 'Street View',
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { color: '#FFFFFF', fontSize: theme.font.large, fontWeight: '700' },
        }}
      />
      <View style={{ flex: 1 }}>
        <TypedWebView
          testID="street-view-webview"
          key={src}
          source={{ html, baseUrl: EMBED_ORIGIN }}
          style={{ flex: 1, backgroundColor: '#000000' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={onNav}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
        {loading ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        ) : null}
        {failed ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#FFFFFF', fontSize: theme.font.large, textAlign: 'center' }}>
              Street View could not load. Check your connection, or open it in Google Maps.
            </Text>
          </View>
        ) : null}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 10, left: 10, right: 10, alignItems: 'center' }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              backgroundColor: 'rgba(0,0,0,0.6)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              fontSize: theme.font.small,
              overflow: 'hidden',
            }}
          >
            Drag to look around – the defibrillator is near this spot
          </Text>
        </View>
      </View>
      <View style={{ padding: 12, gap: 10, backgroundColor: '#111315' }}>
        {params.mly ? (
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
            <ViewerTab active={viewer === 'google'} label="Street View" icon="google-street-view" onPress={() => choose('google')} />
            <ViewerTab active={viewer === 'mapillary'} label="Photo of the AED" icon="camera" onPress={() => choose('mapillary')} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={viewer === 'mapillary' ? 'Open in Mapillary' : 'Open in Google Maps'}
          onPress={() =>
            viewer === 'mapillary' && params.mly
              ? Linking.openURL(mapillaryWebUrl(params.mly))
              : openStreetView(point).then((ok) => {
                  if (!ok) Linking.openURL(streetViewUrl(point)).catch(() => undefined);
                })
          }
          style={{
            minHeight: theme.touch,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <MaterialCommunityIcons name="open-in-new" size={theme.font.large} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: theme.font.body }}>
            {viewer === 'mapillary' ? 'Open in Mapillary' : 'Open in Google Maps'}
          </Text>
        </Pressable>
        <Text style={{ color: c.textMuted === '#F0F0F0' ? '#F0F0F0' : '#B4BAC1', fontSize: 12, textAlign: 'center' }}>
          {viewer === 'mapillary' ? 'Photo © Mapillary contributors (CC BY-SA)' : 'Imagery © Google'}
        </Text>
      </View>
    </View>
  );
}
