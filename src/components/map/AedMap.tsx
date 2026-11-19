import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  NativeUserLocation,
  type CameraRef,
  type GeoJSONSourceRef,
  type TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { LABEL_FONT, safeFontName, type MapStyleId } from '../../lib/mapStyles';
import type { Bounds } from '../../lib/osm';
import type { LatLng } from '../../lib/types';
import { useSettings } from '../../state/SettingsContext';
import type { AedFeatureCollection } from './features';
import { useMapStyle } from './useMapStyle';

/* Shape-coded marker images (see scripts/make_markers.py). */
const MARKER_IMAGES = {
  'aed-std-available': require('../../../assets/markers/aed-std-available.png'),
  'aed-std-closed': require('../../../assets/markers/aed-std-closed.png'),
  'aed-std-restricted': require('../../../assets/markers/aed-std-restricted.png'),
  'aed-std-unknown': require('../../../assets/markers/aed-std-unknown.png'),
  'aed-hc-available': require('../../../assets/markers/aed-hc-available.png'),
  'aed-hc-closed': require('../../../assets/markers/aed-hc-closed.png'),
  'aed-hc-restricted': require('../../../assets/markers/aed-hc-restricted.png'),
  'aed-hc-unknown': require('../../../assets/markers/aed-hc-unknown.png'),
};

export const UK_CENTER: LatLng = { latitude: 54.3, longitude: -2.6 };

/** Count of available units inside each cluster (cluster ring turns green if any). */
const CLUSTER_PROPS = { avail: ['+', ['case', ['==', ['get', 's'], 'available'], 1, 0]] } as const;
const HITBOX = { top: 12, bottom: 12, left: 12, right: 12 };

export interface RegionInfo {
  center: LatLng;
  zoom: number;
  bounds: Bounds;
  bearing: number;
  userInteraction: boolean;
}

export interface AedMapHandle {
  flyTo: (p: LatLng, zoom?: number) => void;
  fitTo: (points: LatLng[]) => void;
  zoomBy: (delta: number) => void;
  resetNorth: () => void;
}

export interface AedMapProps {
  features: AedFeatureCollection;
  selected?: { id: string; latitude: number; longitude: number; status: string } | null;
  onSelect?: (id: string) => void;
  onPressMap?: (p: LatLng) => void;
  onLongPress?: (p: LatLng) => void;
  onRegionChange?: (r: RegionInfo) => void;
  initialCenter?: LatLng;
  initialZoom?: number;
  /** Space covered by floating UI, so centring and ornaments avoid it. */
  insets?: { top: number; bottom: number };
  showUser?: boolean;
  follow?: TrackUserLocation | null;
  onFollowChange?: (mode: TrackUserLocation | null) => void;
  /** A small non-interactive preview (details screen). */
  preview?: boolean;
  styleOverride?: MapStyleId;
  testID?: string;
}

export const AedMap = forwardRef<AedMapHandle, AedMapProps>(function AedMap(
  {
    features,
    selected,
    onSelect,
    onPressMap,
    onLongPress,
    onRegionChange,
    initialCenter,
    initialZoom,
    insets = { top: 0, bottom: 0 },
    showUser = true,
    follow,
    onFollowChange,
    preview,
    styleOverride,
    testID,
  },
  ref,
) {
  const { settings, theme } = useSettings();
  const { style, usingOffline } = useMapStyle(styleOverride);
  const styleJson = useMemo(() => JSON.stringify(style), [style]);
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const zoomRef = useRef(initialZoom ?? 6);
  const centerRef = useRef<LatLng>(initialCenter ?? UK_CENTER);

  const padding = useMemo(
    () => ({ top: insets.top, bottom: insets.bottom, left: 0, right: 0 }),
    [insets.top, insets.bottom],
  );

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (p, zoom) =>
        camera.current?.flyTo({
          center: [p.longitude, p.latitude],
          zoom: zoom ?? Math.max(zoomRef.current, 15),
          padding,
          duration: 900,
        }),
      fitTo: (points) => {
        if (!points.length) return;
        const lats = points.map((p) => p.latitude);
        const lngs = points.map((p) => p.longitude);
        camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
          padding: { top: padding.top + 60, bottom: padding.bottom + 60, left: 60, right: 60 },
          duration: 900,
        });
      },
      zoomBy: (delta) => camera.current?.zoomTo(zoomRef.current + delta, { duration: 250 }),
      resetNorth: () =>
        camera.current?.easeTo({
          center: [centerRef.current.longitude, centerRef.current.latitude],
          bearing: 0,
          pitch: 0,
          duration: 400,
        }),
    }),
    [padding],
  );

  const prefix = theme.highContrast ? 'aed-hc-' : 'aed-std-';
  const iconBase = theme.easy || settings.largeMarkers ? 1.3 : 1;
  const font = usingOffline ? LABEL_FONT.map(safeFontName) : LABEL_FONT;
  const clusterColor = theme.highContrast ? '#000000' : theme.dark ? '#2A2E33' : '#FFFFFF';
  const clusterText = theme.highContrast ? '#FFFFFF' : theme.dark ? '#FFFFFF' : '#0B0C0C';

  const onSourcePress = useCallback(
    async (e: { nativeEvent: { features: GeoJSON.Feature[] }; stopPropagation?: () => void }) => {
      e.stopPropagation?.();
      const f = e.nativeEvent.features?.[0];
      if (!f) return;
      const props = f.properties ?? {};
      const coords = (f.geometry as GeoJSON.Point | undefined)?.coordinates;
      if (props.cluster && coords) {
        const z = await source.current?.getClusterExpansionZoom(Number(props.cluster_id)).catch(() => null);
        camera.current?.easeTo({
          center: [coords[0], coords[1]],
          zoom: Math.min(18, (z ?? zoomRef.current + 2) + 0.3),
          padding,
          duration: 500,
        });
        return;
      }
      if (typeof props.id === 'string') onSelect?.(props.id);
    },
    [onSelect, padding],
  );

  // Serialise once per data change (not on every re-render – the national list is large).
  const data = useMemo(() => JSON.stringify(features), [features]);

  const selectedFeature = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: selected
        ? [
            {
              type: 'Feature',
              id: 1,
              geometry: { type: 'Point', coordinates: [selected.longitude, selected.latitude] },
              properties: { s: selected.status },
            },
          ]
        : [],
    }),
    [selected],
  );

  return (
    <View style={StyleSheet.absoluteFill} testID={testID} pointerEvents={preview ? 'none' : 'auto'}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={styleJson}
        logo={false}
        attribution
        attributionPosition={{ bottom: insets.bottom + 6, left: 8 }}
        compass={!preview}
        compassPosition={{ top: insets.top + 8, left: 12 }}
        compassHiddenFacingNorth
        scaleBar={!preview && settings.showScaleBar}
        scaleBarPosition={{ top: insets.top + 8, left: 64 }}
        touchRotate={!settings.northUp && !preview}
        touchPitch={!preview}
        dragPan={!preview}
        touchZoom={!preview}
        tintColor={theme.colors.primary}
        onPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          onPressMap?.({ latitude: lat, longitude: lng });
        }}
        onLongPress={(e) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          onLongPress?.({ latitude: lat, longitude: lng });
        }}
        onRegionDidChange={(e) => {
          const v = e.nativeEvent;
          zoomRef.current = v.zoom;
          centerRef.current = { latitude: v.center[1], longitude: v.center[0] };
          const [w, s, east, n] = v.bounds;
          onRegionChange?.({
            center: centerRef.current,
            zoom: v.zoom,
            bearing: v.bearing,
            bounds: { west: w, south: s, east, north: n },
            userInteraction: v.userInteraction,
          });
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{
            center: [(initialCenter ?? UK_CENTER).longitude, (initialCenter ?? UK_CENTER).latitude],
            zoom: initialZoom ?? 5.2,
          }}
          minZoom={4}
          maxZoom={19.5}
          trackUserLocation={follow ?? undefined}
          onTrackUserLocationChange={(e) => onFollowChange?.(e.nativeEvent.trackUserLocation)}
        />
        <Images images={MARKER_IMAGES} />
        {showUser ? <NativeUserLocation mode={follow === 'heading' ? 'heading' : 'default'} /> : null}

        <GeoJSONSource
          ref={source}
          id="aeds"
          data={data}
          cluster={settings.clusterMarkers}
          clusterRadius={44}
          clusterMaxZoom={13}
          clusterProperties={CLUSTER_PROPS}
          hitbox={HITBOX}
          onPress={preview ? undefined : onSourcePress}
        >
          <Layer
            id="aed-cluster"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': clusterColor,
              'circle-radius': ['step', ['get', 'point_count'], 17, 10, 20, 100, 24, 1000, 29],
              'circle-stroke-width': 4,
              'circle-stroke-color': [
                'case',
                ['>', ['get', 'avail'], 0],
                theme.colors.status.available.bg,
                theme.colors.status.restricted.bg,
              ],
            }}
          />
          <Layer
            id="aed-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': font,
              'text-size': theme.easy ? 17 : 14,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': clusterText }}
          />
          <Layer
            id="aed-points"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image': ['concat', prefix, ['get', 's']],
              'icon-size': ['interpolate', ['linear'], ['zoom'], 7, iconBase * 0.6, 12, iconBase * 0.85, 15, iconBase],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'symbol-sort-key': ['match', ['get', 's'], 'available', 4, 'unknown', 3, 'closed', 2, 1],
            }}
          />
          {/* Small blue dot = from a community or open-data source rather than OpenStreetMap. */}
          <Layer
            id="aed-badge"
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['!=', ['get', 'src'], 'osm']]}
            minzoom={12}
            paint={{
              'circle-radius': theme.easy ? 6 : 5,
              'circle-color': theme.highContrast ? '#00FFFF' : '#1D70B8',
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#FFFFFF',
              'circle-translate': [12 * iconBase, -12 * iconBase],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="aed-selected" data={selectedFeature}>
          <Layer
            id="aed-selected-halo"
            type="circle"
            paint={{
              'circle-radius': 30 * iconBase,
              'circle-color': theme.highContrast ? '#00FFFF' : theme.colors.primary,
              'circle-opacity': 0.25,
              'circle-stroke-width': 3,
              'circle-stroke-color': theme.highContrast ? '#00FFFF' : theme.colors.primary,
            }}
          />
          <Layer
            id="aed-selected-icon"
            type="symbol"
            layout={{
              'icon-image': ['concat', prefix, ['get', 's']],
              'icon-size': iconBase * 1.35,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
});
