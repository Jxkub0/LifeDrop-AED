/**
 * Runtime configuration from EXPO_PUBLIC_* environment variables
 * (inlined at build time by Expo – see .env.example).
 */

const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  appName: 'UK LifeDrop AED',
  /** Identifies the app to Overpass operators, as their usage policies require. */
  userAgent: process.env.EXPO_PUBLIC_HTTP_USER_AGENT || 'UKLifeDropAED/1.0 (https://github.com/your-org/uk-lifedrop-aed)',
  overpassEndpoints: list(process.env.EXPO_PUBLIC_OVERPASS_ENDPOINTS).length
    ? list(process.env.EXPO_PUBLIC_OVERPASS_ENDPOINTS)
    : DEFAULT_OVERPASS_ENDPOINTS,
  what3wordsApiKey: process.env.EXPO_PUBLIC_W3W_API_KEY || '',
  /** National defibrillator dataset (OpenStreetMap data packaged by OpenAEDMap). */
  nationalDataUrl: process.env.EXPO_PUBLIC_NATIONAL_DATA_URL || 'https://openaedmap.org/api/v1/countries/GB.geojson',
  /** Extra GeoJSON/CSV feeds baked into a build: "Name|https://url,Name 2|https://url2". */
  extraFeeds: list(process.env.EXPO_PUBLIC_EXTRA_FEEDS).map((entry, i) => {
    const [name, url] = entry.includes('|') ? entry.split('|') : [`Feed ${i + 1}`, entry];
    return { name: name.trim(), url: url.trim() };
  }),
  /** Optional satellite tiles (e.g. a commercial provider with your key). Defaults to Esri World Imagery. */
  satelliteTileUrl: process.env.EXPO_PUBLIC_SATELLITE_TILE_URL || '',
  satelliteAttribution: process.env.EXPO_PUBLIC_SATELLITE_ATTRIBUTION || '',
  /**
   * Google Maps Embed API key (restricted to this app) – enables the full
   * interactive Street View viewer inside the app. Without it the app uses
   * Google's keyless Street View embed and falls back to the Google Maps app.
   */
  googleEmbedApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY || '',
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  },
  /** How long downloaded defibrillator data is treated as fresh. Older data is still shown offline. */
  cacheFreshMs: 24 * 60 * 60 * 1000,
  /** Radius searched by "Find closest available". */
  nearestSearchRadiusM: 3000,
  /** Wider radius used if nothing is found in the first pass. */
  nearestFallbackRadiusM: 10000,
};

export const isFirebaseConfigured = Boolean(config.firebase.apiKey && config.firebase.projectId);
