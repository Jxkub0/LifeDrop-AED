/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Smoke tests that render the real screens through Expo Router with the
 * native layers (maps, SQLite, GPS, network) replaced by in-memory fakes.
 */
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { Defibrillator } from '../lib/types';

const USER = { latitude: 51.5007, longitude: -0.1246 };
const north = (m: number) => ({ latitude: USER.latitude + m / 111_320, longitude: USER.longitude });

const mockFixture: Defibrillator[] = [
  {
    id: 'osm:node/1',
    source: 'osm',
    ...north(200),
    openingHours: '24/7',
    locationDescription: 'On the wall outside the post office',
    locked: true,
    pinCode: 'C159',
  },
  { id: 'osm:node/2', source: 'osm', ...north(40), openingHours: '24/7', access: 'private' },
  { id: 'osm:node/3', source: 'osm', ...north(900), openingHours: '24/7', locationDescription: 'Station entrance' },
];

/* ---------------- native fakes ---------------- */

const mockKv: Record<string, unknown> = {};

jest.mock('../services/storage', () => ({
  readJson: (k: string) => (k in mockKv ? mockKv[k] : null),
  writeJson: (k: string, v: unknown) => {
    mockKv[k] = v;
  },
  loadHolidayTable: () => jest.requireActual('../lib/bankHolidaysData').BUNDLED_BANK_HOLIDAYS,
  refreshHolidayTable: async () => null,
  loadRegion: () => 'england-and-wales',
  saveRegion: () => undefined,
}));

jest.mock('../services/db', () => ({
  getTileTimes: async () => ({}),
  saveTileDefibs: async () => undefined,
  upsertDefibs: async () => undefined,
  getDefibsForTiles: async () => [],
  getDefibsBySource: async () => [],
  getDefibById: async () => null,
  listSubmissions: async () => [],
  clearDownloadedData: async () => undefined,
  getCachedWords: async () => null,
  setCachedWords: async () => undefined,
}));

jest.mock('../services/location', () => ({
  getPermissionState: async () => 'granted',
  requestPermission: async () => 'granted',
  getCurrentLocation: async () => ({ latitude: 51.5007, longitude: -0.1246 }),
  watchLocation: async () => () => undefined,
  deviceGeocode: async () => null,
}));

jest.mock('../services/cloud', () => ({
  cloudEnabled: false,
  fetchCommunityNear: async () => [],
  pushSubmission: async () => ({}),
}));

jest.mock('../services/speech', () => ({
  speak: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(),
  setSpeechRate: jest.fn(),
}));

jest.mock('../lib/overpass', () => ({
  fetchDefibsForTiles: jest.fn(async () => mockFixture),
}));

jest.mock('../lib/search', () => ({
  ...jest.requireActual('../lib/search'),
  lookupCountry: async () => 'England',
}));

jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR' },
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true, type: 'WIFI' }),
}));

jest.mock('react-native-webview', () => {
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const WebView = ReactActual.forwardRef((_props: unknown, ref: unknown) => {
    ReactActual.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
    return ReactActual.createElement(View, { testID: 'webview' });
  });
  return { __esModule: true, WebView, default: WebView };
});

jest.mock('../services/nationalData', () => ({
  getNationalMeta: () => null,
  loadNationalData: async () => ({
    defibs: mockFixture,
    meta: { etag: null, updatedAt: Date.now(), checkedAt: Date.now(), count: mockFixture.length, origin: 'bundled' },
  }),
  nationalDataIsStale: () => false,
  refreshNationalData: async () => ({ status: 'error', message: 'offline in tests' }),
  clearNationalData: () => undefined,
}));

jest.mock('../services/feeds', () => ({
  getAllFeeds: () => [],
  getUserFeeds: () => [],
  saveUserFeeds: () => undefined,
  getFeedStatuses: () => ({}),
  loadCachedFeed: async () => [],
  feedIsStale: () => false,
  fetchFeed: async () => [],
  deleteFeedCache: () => undefined,
}));

jest.mock('../services/offlineMaps', () => ({
  listAreas: () => [],
  hasOfflineMaps: () => false,
  offlineRefs: () => null,
  subscribeAreas: () => () => undefined,
  areasVersion: () => 0,
  offlineBytes: () => 0,
  isCoveredOffline: () => false,
  downloadArea: jest.fn(),
  deleteArea: () => undefined,
  MAX_TILES_PER_DOWNLOAD: 3000,
  MAX_BYTES_PER_DOWNLOAD: 50 * 1024 * 1024,
  OFFLINE_MAX_ZOOM: 14,
  OFFLINE_MIN_ZOOM: 0,
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: async () => undefined,
  deactivateKeepAwake: async () => undefined,
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));

/* ---------------- routes ---------------- */

const routes = {
  _layout: require('../app/_layout').default,
  index: require('../app/index').default,
  onboarding: require('../app/onboarding').default,
  map: require('../app/map').default,
  nearby: require('../app/nearby').default,
  'defib/[id]': require('../app/defib/[id]').default,
  add: require('../app/add').default,
  settings: require('../app/settings').default,
  streetview: require('../app/streetview').default,
  offline: require('../app/offline').default,
  sources: require('../app/sources').default,
};

function setSettings(s: Record<string, unknown>) {
  for (const k of Object.keys(mockKv)) delete mockKv[k];
  mockKv['settings.v1'] = s;
}

afterEach(() => {
  jest.clearAllTimers();
});

describe('screens', () => {
  it('runs first-launch onboarding and lands on the Easy home screen', async () => {
    setSettings({ onboarded: false });
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('Choose how the app looks')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: /Easy view/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Allow location' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(await screen.findByText('FIND NEAREST DEFIBRILLATOR NOW')).toBeTruthy();
    expect(screen.getByText('In a cardiac emergency, always call 999 first.')).toBeTruthy();
    expect(mockKv['settings.v1']).toMatchObject({ onboarded: true, uiMode: 'easy', highContrast: true });
  });

  it('Easy view: finds the closest available unit and opens its details', async () => {
    setSettings({ onboarded: true, uiMode: 'easy', highContrast: true });
    await renderRouter(routes, { initialUrl: '/' });

    const button = await screen.findByTestId('find-nearest-now');
    await fireEvent.press(button);

    // The private unit at 40 m is skipped; the 24/7 unit at 200 m is chosen.
    expect(await screen.findByText('On the wall outside the post office')).toBeTruthy();
    expect(screen.getByText('C159')).toBeTruthy();
    expect(screen.getByText('200 metres (220 yards)')).toBeTruthy();
    expect(screen.getByText(/About \d+ min walk · to the north/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get Directions (Map App)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See Location in Street View' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open in what3words/ })).toBeTruthy();
  });

  it('Standard view: the Nearest AED button opens the closest unit in the bottom sheet', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/' });

    const button = await screen.findByTestId('find-closest-available');
    await fireEvent.press(button);
    expect(await screen.findByText('CLOSEST AVAILABLE DEFIBRILLATOR')).toBeTruthy();
    expect(screen.getByText('C159')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Directions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Street View' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Call 999' }).length).toBeGreaterThan(1);
  });

  it('Standard view: shows nearby units in the sheet and finds a unit by name', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Defibrillators near you', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('Station entrance')).toBeTruthy();

    const input = screen.getByTestId('search-input');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'post office');
    const hit = await screen.findByRole('button', { name: /On the wall outside the post office/ });
    await fireEvent.press(hit);
    expect(await screen.findByRole('button', { name: 'Directions' })).toBeTruthy();
  });

  it('opens Street View inside the app', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/streetview?lat=51.5&lng=-0.12&title=Test' });
    expect(await screen.findByTestId('webview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open in Google Maps' })).toBeTruthy();
  });

  it('shows data sources and offline maps', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/sources' });
    expect((await screen.findAllByText('3 defibrillators', {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(screen.getByText('The Circuit (British Heart Foundation)')).toBeTruthy();
  });

  it('renders the offline maps screen', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/offline' });
    expect(await screen.findByText('No offline maps yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('lists nearby units, available ones first', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/nearby' });
    expect(await screen.findByText('On the wall outside the post office', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Station entrance')).toBeTruthy();
  });

  it('renders the add-defibrillator wizard', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/add' });
    expect(await screen.findByText('Where is it?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'My location' }));
    await waitFor(() => expect(screen.getByText('Pin at 51.50070, -0.12460')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('How can people get to it?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: /Business Hours Only/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('When is it available?')).toBeTruthy();
    expect(screen.getByText('STEP 3 OF 5')).toBeTruthy();
  });

  it('renders settings', async () => {
    setSettings({ onboarded: true, uiMode: 'standard' });
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByText('Layout')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Voice guidance' })).toBeTruthy();
    expect(screen.getByText('Map type')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Map type: Satellite' })).toBeTruthy();
  });
});
