import { File } from 'expo-file-system';
import { distanceBetween, geohashForLocation, geohashQueryBounds } from 'geofire-common';
import { config, isFirebaseConfigured } from '../lib/config';
import type { AccessType, Defibrillator, LatLng } from '../lib/types';

/**
 * Firebase (Firestore + Storage) sync for community-added defibrillators.
 *
 * Everything here is optional and the Firebase SDK is only loaded (with an inline
 * `require`) when keys are configured, so a build without Firebase never runs any
 * Firebase code at start-up.
 */

type AppModule = typeof import('firebase/app');
type FirestoreModule = typeof import('firebase/firestore');
type StorageModule = typeof import('firebase/storage');

interface FirebaseHandles {
  app: import('firebase/app').FirebaseApp;
  db: import('firebase/firestore').Firestore;
  fs: FirestoreModule;
  st: StorageModule;
}

const COLLECTION = 'defibrillators';
let handles: FirebaseHandles | null = null;

function ensureFirebase(): FirebaseHandles | null {
  if (!isFirebaseConfigured) return null;
  if (!handles) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fa: AppModule = require('firebase/app');
    const fs: FirestoreModule = require('firebase/firestore');
    const st: StorageModule = require('firebase/storage');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const app = fa.getApps().length ? fa.getApp() : fa.initializeApp(config.firebase);
    // Long polling is the reliable transport for Firestore inside React Native.
    const db = fs.initializeFirestore(app, { experimentalForceLongPolling: true });
    handles = { app, db, fs, st };
  }
  return handles;
}

export const cloudEnabled = isFirebaseConfigured;

/** Shape stored in Firestore. Kept flat and validated by firestore.rules. */
interface CloudDefib {
  lat: number;
  lng: number;
  geohash: string;
  accessType: AccessType;
  openingHours: string;
  locationDescription: string;
  pinCode?: string;
  contact?: string;
  photoUrl?: string;
  name?: string;
  createdAt: unknown;
  schemaVersion: 1;
}

function toCloud(fb: FirebaseHandles, d: Defibrillator, photoUrl?: string): CloudDefib {
  const out: CloudDefib = {
    lat: d.latitude,
    lng: d.longitude,
    geohash: geohashForLocation([d.latitude, d.longitude], 10),
    accessType: d.accessType ?? '24/7',
    openingHours: d.openingHours ?? '24/7',
    locationDescription: d.locationDescription ?? '',
    createdAt: fb.fs.serverTimestamp(),
    schemaVersion: 1,
  };
  if (d.pinCode) out.pinCode = d.pinCode;
  if (d.contact) out.contact = d.contact;
  if (d.name) out.name = d.name;
  if (photoUrl ?? d.photoUrl) out.photoUrl = photoUrl ?? d.photoUrl;
  return out;
}

function fromCloud(fb: FirebaseHandles, id: string, c: Partial<CloudDefib>): Defibrillator | null {
  if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
  const created = c.createdAt instanceof fb.fs.Timestamp ? c.createdAt.toMillis() : undefined;
  return {
    id: `community:${id}`,
    source: 'community',
    latitude: c.lat,
    longitude: c.lng,
    name: c.name,
    accessType: c.accessType,
    openingHours: c.openingHours,
    locationDescription: c.locationDescription || undefined,
    pinCode: c.pinCode,
    locked: c.accessType === 'restricted' || Boolean(c.pinCode),
    contact: c.contact,
    photoUrl: c.photoUrl,
    access: 'yes',
    createdAt: created,
    syncStatus: 'synced',
  };
}

const rawId = (id: string) => id.replace(/^community:/, '');

async function uploadPhoto(fb: FirebaseHandles, id: string, localUri: string): Promise<string> {
  const storage = fb.st.getStorage(fb.app);
  const bytes = new Uint8Array(await new File(localUri).arrayBuffer());
  const storageRef = fb.st.ref(storage, `defib-photos/${rawId(id)}.jpg`);
  await fb.st.uploadBytes(storageRef, bytes, { contentType: 'image/jpeg' });
  return fb.st.getDownloadURL(storageRef);
}

/**
 * Upload one submission. Uses the device-generated id as the document id so a
 * retry can never create a duplicate. Returns the photo URL if one was uploaded.
 */
export async function pushSubmission(d: Defibrillator, photoLocalUri: string | null): Promise<{ photoUrl?: string }> {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Cloud sync is not configured');
  const docRef = fb.fs.doc(fb.fs.collection(fb.db, COLLECTION), rawId(d.id));

  let photoUrl = d.photoUrl?.startsWith('http') ? d.photoUrl : undefined;
  if (!photoUrl && photoLocalUri) photoUrl = await uploadPhoto(fb, d.id, photoLocalUri);

  try {
    await fb.fs.setDoc(docRef, toCloud(fb, d, photoUrl));
  } catch (e: unknown) {
    // Rules only allow creates; if an earlier attempt already succeeded we get permission-denied.
    const code = (e as { code?: string })?.code;
    if (code === 'permission-denied') {
      const existing = await fb.fs.getDoc(docRef);
      if (existing.exists()) return { photoUrl };
    }
    throw e;
  }
  return { photoUrl };
}

/** Community-added defibrillators within `radiusM` of a point (geohash range queries). */
export async function fetchCommunityNear(center: LatLng, radiusM: number): Promise<Defibrillator[]> {
  const fb = ensureFirebase();
  if (!fb) return [];
  const { collection, getDocs, query, orderBy, startAt, endAt } = fb.fs;
  const c: [number, number] = [center.latitude, center.longitude];
  const bounds = geohashQueryBounds(c, radiusM);
  const col = collection(fb.db, COLLECTION);
  const snaps = await Promise.all(
    bounds.map(([start, end]) => getDocs(query(col, orderBy('geohash'), startAt(start), endAt(end)))),
  );
  const seen = new Set<string>();
  const out: Defibrillator[] = [];
  for (const snap of snaps) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      const d = fromCloud(fb, docSnap.id, docSnap.data() as Partial<CloudDefib>);
      if (!d) continue;
      if (distanceBetween([d.latitude, d.longitude], c) * 1000 <= radiusM) out.push(d);
    }
  }
  return out;
}
