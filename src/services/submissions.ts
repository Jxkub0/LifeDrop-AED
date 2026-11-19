import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { AccessType, Defibrillator, LatLng } from '../lib/types';
import { cloudEnabled, pushSubmission } from './cloud';
import { addSubmission, listSubmissions, updateSubmission } from './db';

export interface NewDefibInput {
  location: LatLng;
  accessType: AccessType;
  pinCode?: string;
  openingHours: string;
  locationDescription: string;
  siteName?: string;
  contact?: string;
  photoTempUri?: string | null;
}

/** Copy a picked photo into app storage so it survives cache clean-ups until it is uploaded. */
function persistPhoto(tempUri: string, id: string): string {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${id}.jpg`);
  if (dest.exists) dest.delete();
  new File(tempUri).copy(dest);
  return dest.uri;
}

/** Save a new community defibrillator locally (immediately visible), then try to upload it. */
export async function createSubmission(input: NewDefibInput): Promise<Defibrillator> {
  const uuid = randomUUID();
  const id = `community:${uuid}`;
  let photoLocalUri: string | null = null;
  if (input.photoTempUri) {
    try {
      photoLocalUri = persistPhoto(input.photoTempUri, uuid);
    } catch {
      photoLocalUri = input.photoTempUri;
    }
  }

  const defib: Defibrillator = {
    id,
    source: 'community',
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    name: input.siteName?.trim() || undefined,
    accessType: input.accessType,
    openingHours: input.openingHours,
    access: 'yes',
    locked: input.accessType === 'restricted',
    pinCode: input.accessType === 'restricted' ? input.pinCode?.trim() || undefined : undefined,
    locationDescription: input.locationDescription.trim(),
    contact: input.contact?.trim() || undefined,
    photoUrl: photoLocalUri ?? undefined,
    createdAt: Date.now(),
    syncStatus: cloudEnabled ? 'pending' : undefined,
  };
  await addSubmission(defib, photoLocalUri);
  return defib;
}

let syncing: Promise<{ synced: number; failed: number }> | null = null;

/** Upload any submissions that have not reached the cloud yet. Safe to call often. */
export function syncPendingSubmissions(): Promise<{ synced: number; failed: number }> {
  if (!cloudEnabled) return Promise.resolve({ synced: 0, failed: 0 });
  if (syncing) return syncing;
  syncing = (async () => {
    let synced = 0;
    let failed = 0;
    const rows = await listSubmissions();
    for (const row of rows) {
      if (row.syncStatus === 'synced') continue;
      try {
        const { photoUrl } = await pushSubmission(row.defib, row.photoLocalUri);
        await updateSubmission(row.id, {
          syncStatus: 'synced',
          lastError: null,
          defib: { ...row.defib, photoUrl: photoUrl ?? row.defib.photoUrl },
        });
        synced++;
      } catch (e) {
        failed++;
        await updateSubmission(row.id, {
          syncStatus: 'failed',
          lastError: e instanceof Error ? e.message : String(e),
          defib: row.defib,
        });
      }
    }
    return { synced, failed };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
