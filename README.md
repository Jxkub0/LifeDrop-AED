# UK LifeDrop AED

A cross-platform (iOS + Android) app for finding, checking and getting to Public Access Defibrillators (PADs) in the United Kingdom.

Built with **Expo SDK 58 / React Native 0.88 / TypeScript**, so one codebase compiles to an iOS app and an Android APK/AAB.

> In a cardiac emergency, always call 999 first. The call handler can direct you to the nearest defibrillator and give you cabinet codes.

---

## Features

| Area | What it does | Where |
|---|---|---|
| **Full-screen map** | Native vector map (MapLibre) filling the screen, Google-Maps-style: floating search bar with as-you-type suggestions (postcodes, places **and defibrillators by name**), filter chips, layers button, "My location" (tap again for compass mode), big red **Nearest AED** button and a draggable bottom sheet with the nearby list or the selected unit | `src/screens/MapScreen.tsx`, `src/components/map/*`, `src/components/BottomSheet.tsx` |
| **Map types** | Default (OpenFreeMap "Liberty"), **Satellite** and **Hybrid** (Esri World Imagery, with street names), Light and Dark; optional 3D buildings, shops & places, scale bar, north-up | `src/lib/mapStyles.ts`, `src/components/map/LayersSheet.tsx` |
| **Markers** | GPU-clustered (23,000+ points stay smooth); colour **and shape** coded: green circle ✓ available, red square ✕ closed, grey square 🔒 private, yellow diamond ? hours unconfirmed; blue dot = from app users / council data | `src/components/map/AedMap.tsx`, `scripts/make_markers.py` |
| **In-app Street View** | Google Street View panorama inside the app (Embed API key optional), plus the **Mapillary photo of the cabinet** where OpenStreetMap links one | `src/app/streetview.tsx`, `src/lib/streetView.ts` |
| **Multiple data sources** | 1) every UK defibrillator on OpenStreetMap via **OpenAEDMap**'s national file (23,398 at build time); 2) optional **live OpenStreetMap** (Overpass) for edits made minutes ago; 3) **app users'** additions (Firebase); 4) **council open data** (Leeds, Trafford, Runnymede built in) and any **GeoJSON/CSV feed** the user or publisher adds. Duplicates within 25 m (or with the same Circuit ref) are merged and shown once with "also listed by…" | `src/lib/sources/*`, `src/lib/dedupe.ts`, `src/services/nationalData.ts`, `src/services/feeds.ts`, `src/app/sources.tsx` |
| **Loads instantly** | The national list ships **inside the app** (compact 2.8 MB snapshot) so the map is full on first launch with no signal. A daily check sends the ETag and only downloads when OpenAEDMap has changed. Availability is cached per minute and map data is only re-sent when a status actually changes | `assets/data/aeds-gb.dat`, `scripts/build-aed-snapshot.js`, `src/state/DefibContext.tsx` |
| **Offline maps** | Download a street map for an area (4×4 to 40×40 km) with progress and cancel; used automatically with no signal (or always, to save data). Plus a configurable cache of recently viewed areas | `src/services/offlineMaps.ts`, `src/app/offline.tsx` |
| **Settings** | Layout (Standard/Easy), high contrast, theme (match phone/light/dark), text size, distance units, map type and details, which units to show, search distance, walking/driving, preferred directions app, voice on/off and speed, vibration, keep screen on, auto-update / Wi-Fi only / live updates, map cache size, clear caches, reset | `src/app/settings.tsx`, `src/state/SettingsContext.tsx` |
| Onboarding & Easy view | 22 pt text (never below 20), ≥ 64 px targets, labels on every icon, full-width **FIND NEAREST DEFIBRILLATOR NOW** | `src/app/onboarding.tsx`, `src/screens/EasyHome.tsx` |
| Availability engine | OSM `opening_hours` against local time and UK bank holidays | `src/lib/openingHours.ts`, `src/lib/availability.ts` |
| Find closest available | Haversine over the whole national list (bounding-box pre-filter), search radius from settings, widening to 10 km | `src/lib/nearest.ts` |
| Directions & links | Preferred app (Google/Apple/Waze) or ask each time; walking or driving; what3words; share | `src/state/useDirections.tsx`, `src/services/external.ts` |
| Add a defibrillator | Map moves under a fixed pin (long-press the main map to start there), access type, hours, notes, contact, photo; SQLite + Firebase sync | `src/app/add.tsx` |
| Reliability | Persistent "call 999 first" banner, crash capture with "Send error details", location fallback for phones without Google Play services | `src/components/EmergencyBanner.tsx`, `src/services/crashLog.ts`, `src/services/location.ts` |

---

## Getting started

Requirements: Node 22+, and for local native builds Xcode (iOS) / Android Studio (Android). Cloud builds with EAS need neither.

```bash
npm install
cp .env.example .env        # fill in keys (all optional for a first run)
npx expo start              # scan the QR code with Expo Go, or press a / i
```

Every native module used is included in Expo Go, so you can try the app there. For a standalone build use a development build:

```bash
npx expo run:android        # or: npx expo run:ios
```

### Build an Android APK

The easiest way: push to `main` on GitHub and download the `.apk` from the repository's **Releases** page (built by `.github/workflows/build-apps.yml`, signed with the standard React Native debug key so new builds install over old ones). To build it yourself:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable .apk
npx eas-cli@latest build -p android --profile production   # .aab for Google Play
```

Or locally (JDK 17+ and the Android SDK with `platforms;android-37.0`, `build-tools;37.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`):

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64
# → android/app/build/outputs/apk/release/app-release.apk
```

No map API key is needed: maps are drawn by MapLibre from OpenFreeMap. Refresh the bundled defibrillator list before a release with `npm run build:aed-data`.

R8 code shrinking is switched off (via `expo-build-properties` in `app.config.ts`): with it on, the first APK closed straight away on launch, and Expo Modules logs that expo-sqlite, expo-haptics and expo-location values are not R8-safe in this SDK. Re-enable it only after testing on a device.

If the app ever hits a fatal error, it is saved and shown on the next launch with a **Send error details** button, so testers can share the exact error.

The generated release build is signed with the debug keystore – fine for installing directly on phones, but for Google Play let EAS manage a proper upload key (or configure your own keystore).

### Build for iOS

**Minimum iOS: 16.4** (set by Expo SDK 58; React Native alone would allow 15.1). That covers iPhone 8 / 8 Plus / X and every newer iPhone, including SE (2nd gen) and later. iPhones that stop at iOS 15 (6s, 7, SE 1st gen) are not supported.

iPhone apps can only be compiled with Apple's Xcode on macOS (Xcode 26 or newer), so there are three ways to get the app onto a phone:

| Route | Needs | Result |
|---|---|---|
| **GitHub Actions → unsigned .ipa → sideload** | A GitHub repo with this project (public repos get macOS build minutes free) | Every push to `main` runs *Build apps (Android APK + iPhone IPA)* (~25 min) and publishes the `.apk` and `-unsigned.ipa` on the **Releases** page. You can also start it from the Actions tab → *Run workflow*. Install the `.ipa` with **Sideloadly** or **AltStore**, which sign it with your own Apple ID. |
| **A Mac** | Xcode 26+, CocoaPods | `npm run build:ios:unsigned` → `build/ios/UK-LifeDrop-AED-<version>-unsigned.ipa` (sideload as above), or `npx expo run:ios --device --configuration Release` to install straight to a plugged-in iPhone. |
| **EAS Build (Expo cloud)** | Expo account + paid Apple Developer Program | `npx eas-cli@latest build -p ios --profile preview` gives a signed ad-hoc build installable from a link on registered iPhones; `--profile production` + `eas submit -p ios` for TestFlight / App Store. |

Sideloading notes:
- With a **free Apple ID** the app expires after **7 days** (re-sign/refresh in Sideloadly or AltStore) and you can have up to 3 sideloaded apps. A paid developer account gives 1 year.
- On iOS 16+, turn on **Settings → Privacy & Security → Developer Mode** and restart, then trust your Apple ID under **Settings → General → VPN & Device Management**.
- The app needs no special entitlements (no push, no iCloud), so free-account signing works.
- Bundle ID is `uk.lifedrop.aed`; Sideloadly may change it to make it unique to your Apple ID – that is fine.

---

## Configuration (`.env`)

| Variable | Needed for |
|---|---|
| `EXPO_PUBLIC_HTTP_USER_AGENT` | Identifies the app to OpenFreeMap, OpenAEDMap and Overpass. **Set this to your app name + contact.** |
| `EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | Optional. Google Maps Embed API key (free, unlimited) for the official in-app Street View viewer; restrict it to the referrer `https://uklifedrop.app/`. Without it the app uses Google's keyless Street View embed. |
| `EXPO_PUBLIC_SATELLITE_TILE_URL`, `EXPO_PUBLIC_SATELLITE_ATTRIBUTION` | Optional. Your own satellite tiles (e.g. MapTiler with a key). Default: Esri World Imagery. |
| `EXPO_PUBLIC_EXTRA_FEEDS` | Optional. Extra GeoJSON/CSV defibrillator feeds baked into the build: `Name|https://…,Name 2|https://…` |
| `EXPO_PUBLIC_NATIONAL_DATA_URL` | Optional. Override the national dataset URL (default OpenAEDMap `GB.geojson`). |
| `EXPO_PUBLIC_OVERPASS_ENDPOINTS` | Comma-separated Overpass servers for the optional live updates. |
| `EXPO_PUBLIC_W3W_API_KEY` | Exact what3words address on the card and deep link into the what3words app. |
| `EXPO_PUBLIC_FIREBASE_*` | Cloud sync of community additions. Without them, additions stay on the device. |

### Firebase setup

1. Create a Firebase project, add a **Web app**, copy its config into the `EXPO_PUBLIC_FIREBASE_*` variables.
2. Enable **Cloud Firestore** and **Storage**.
3. Deploy the security rules in `firebase/`:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage --project <your-project-id>
   ```
   Rules allow public reads and validated **create-only** writes inside a UK bounding box; edits/deletes are done by you in the console.
4. Recommended before launch: enable **Firebase App Check** to stop scripted abuse.

---

## How availability is decided

1. `access=private/no/permit…` → **Restricted** (grey square).
2. `opening_hours` present → parsed and evaluated at the phone's current local time, including UK bank holidays for England & Wales, Scotland or Northern Ireland (region from postcodes.io; dates from GOV.UK, bundled to 2028 for offline use and refreshed weekly). Open → **Available**, shut → **Closed** with the next opening time.
3. Hours can't be evaluated (sunrise/sunset, months, school holidays, free text) → **Hours unclear**.
4. No hours but tagged `indoor=no` → **Available (assumed)** – outdoor cabinets are normally 24/7; the card says so.
5. No hours and indoor/unknown → **Hours not listed**.

"Find Closest Available" uses only *Available* units within 3 km (10 km if none). If none are confirmed it falls back to the nearest unconfirmed one with a clear warning. If an unconfirmed unit is much closer than the nearest confirmed one, it is offered as an alternative.

---

## Project layout

```
src/
  app/                 Expo Router screens (file = route)
    _layout.tsx        providers, stack, persistent 999 banner
    index.tsx          home → Easy home or Standard map
    onboarding.tsx     first-launch setup
    map.tsx, nearby.tsx, add.tsx, settings.tsx, defib/[id].tsx
    streetview.tsx     in-app Street View / Mapillary photo
    offline.tsx        offline map downloads
    sources.tsx        data sources and custom feeds
  screens/             MapScreen, EasyHome
  components/          buttons, markers, map, pickers (accessible building blocks)
  components/map/      MapLibre map, search bar, layers sheet, bottom-sheet content
  lib/                 pure logic – opening hours, geo, sources & dedupe, map styles, tile maths (unit-tested)
  lib/styles/          bundled OpenFreeMap styles (Liberty, Positron, Dark)
  services/            device & network I/O – SQLite, location, Firebase, speech, deep links
  state/               SettingsContext (UI mode/theme), DefibContext (data, location, nearest)
  __tests__/           Jest tests
firebase/              Firestore & Storage security rules
```

## Quality checks

```bash
npm run typecheck   # TypeScript, strict
npm run lint        # ESLint (expo config, React Compiler rules)
npm test            # 88 tests: opening-hours engine, availability, Haversine, Overpass client,
                    # OpenAEDMap/CSV/GeoJSON parsing, OS grid conversion, duplicate merging,
                    # map styles & offline rewrite, tile maths, Street View URLs, and screen tests
npx expo-doctor
```

---

## Things to know before releasing

- **Data coverage.** OpenStreetMap is volunteer-mapped and not complete. The national register used by UK ambulance services is the British Heart Foundation's *The Circuit*, which has no public API; OSM entries tagged `ref:GB:the_circuit` came from it. The app always tells users to call 999.
- **Cabinet codes.** In the UK, codes for locked cabinets are normally given out by the 999 call handler. Codes shared in the app can be out of date, so locked units without a code show "the 999 call handler will give you the code", and the add form warns that codes are public.
- **The Circuit.** BHF's register (used by ambulance services) is not openly licensed – its terms require written consent for anything beyond non-commercial use – so it is not imported. The Data sources screen links to DefibFinder and reminds users that 999 call handlers can see every registered unit.
- **OpenFreeMap** (map tiles) is free with no key. Its fair-use terms allow offline downloads of up to 3,000 tiles / 50 MB per download with at most 4 parallel requests and a unique User-Agent – the offline downloader enforces all of these. For very large audiences consider self-hosting (it is open source).
- **Satellite imagery** is Esri World Imagery, shown with Esri's attribution. Check Esri's terms for your use (commercial apps may need an ArcGIS account) or set `EXPO_PUBLIC_SATELLITE_TILE_URL` to a provider you have a licence for. Satellite cannot be saved offline.
- **Keyless Street View** uses Google's public embed URL inside an iframe; it is widely used but undocumented. Set `EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY` to use the official Embed API (free, unlimited).
- **Overpass servers are volunteer-run**, so live updates are off by default; the national OpenAEDMap file covers the same OpenStreetMap data, refreshed continuously.
- **Council feeds** (Leeds 2019, Trafford 2018, Runnymede) are old; they only add units not already on OpenStreetMap, and are labelled with their source.
- **what3words without a key** opens `what3words.com/<lat>,<lng>`, which is not a documented URL format – set `EXPO_PUBLIC_W3W_API_KEY` for a reliable link and to show the 3 word address.
- **Walking time** is an estimate (straight-line distance × 1.3 at 5 km/h). The map apps give the real route.
- **Firebase rules** are written but have not been run against the Firebase emulator – test them before launch.
- Community additions live in Firestore and are not pushed back to OpenStreetMap.

## Data attribution

Defibrillator data © OpenStreetMap contributors (ODbL), packaged by OpenAEDMap. Council data contains public sector information licensed under the Open Government Licence v3.0. Map tiles © OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors. Satellite imagery © Esri, Vantor/Maxar, Earthstar Geographics and the GIS User Community. Street View © Google. Photos © Mapillary contributors (CC BY-SA). Postcode data from postcodes.io (contains OS and Royal Mail data © Crown copyright and database right). Bank holidays from GOV.UK (OGL). what3words © what3words Ltd.
