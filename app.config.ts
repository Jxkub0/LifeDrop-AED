import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App configuration. Secrets and per-environment values come from environment
 * variables (see .env.example) so nothing sensitive is committed to source.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'UK LifeDrop AED',
  slug: 'uk-lifedrop-aed',
  scheme: 'uklifedrop',
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    buildNumber: '4',
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'uk.lifedrop.aed',
    supportsTablet: true,
    infoPlist: {
      // Lets Linking.canOpenURL() detect these apps for the directions / what3words buttons.
      LSApplicationQueriesSchemes: ['comgooglemaps', 'waze', 'w3w'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    versionCode: 4,
    package: process.env.ANDROID_PACKAGE ?? 'uk.lifedrop.aed',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-build-properties',
      {
        android: {
          // R8 code shrinking breaks some Expo modules at runtime in this SDK
          // (the app closed immediately on launch). Keep it off.
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
        },
      },
    ],
    'expo-sqlite',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'UK LifeDrop AED uses your location to find the nearest defibrillator and show you how to get there.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose a photo of the defibrillator cabinet so others can recognise it.',
        cameraPermission: 'Take a photo of the defibrillator cabinet so others can recognise it.',
        microphonePermission: false,
      },
    ],
    // Native vector map engine (MapLibre) – no Google Maps key needed on any platform.
    '@maplibre/maplibre-react-native',
    'expo-web-browser',
  ],
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
