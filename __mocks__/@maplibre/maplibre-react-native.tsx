/* Jest stand-in for the native MapLibre map (no OpenGL in tests). */
import React from 'react';
import { View } from 'react-native';

type Props = { children?: React.ReactNode; testID?: string };

export const Map = React.forwardRef((props: Props, ref: React.Ref<unknown>) => {
  React.useImperativeHandle(ref, () => ({
    getCenter: async () => [0, 0],
    getZoom: async () => 10,
    queryRenderedFeatures: async () => [],
  }));
  return <View testID="maplibre-map">{props.children}</View>;
});
Map.displayName = 'MockMap';

export const Camera = React.forwardRef((_props: Props, ref: React.Ref<unknown>) => {
  React.useImperativeHandle(ref, () => ({
    flyTo: jest.fn(),
    easeTo: jest.fn(),
    jumpTo: jest.fn(),
    fitBounds: jest.fn(),
    zoomTo: jest.fn(),
    setStop: jest.fn(async () => undefined),
  }));
  return null;
});
Camera.displayName = 'MockCamera';

export const GeoJSONSource = React.forwardRef((props: Props, ref: React.Ref<unknown>) => {
  React.useImperativeHandle(ref, () => ({ getClusterExpansionZoom: async () => 14 }));
  return <View>{props.children}</View>;
});
GeoJSONSource.displayName = 'MockGeoJSONSource';

export const Layer = () => null;
export const Images = () => null;
export const NativeUserLocation = () => null;
export const UserLocation = () => null;
export const Marker = (props: Props) => <View>{props.children}</View>;

export const LocationManager = {
  getCurrentPosition: async () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  start: () => undefined,
  stop: () => undefined,
};
export const OfflineManager = {
  setMaximumAmbientCacheSize: async () => undefined,
  clearAmbientCache: async () => undefined,
};
export const TransformRequestManager = { addHeader: () => 'h1' };
export const NetworkManager = { setConnected: () => undefined };
