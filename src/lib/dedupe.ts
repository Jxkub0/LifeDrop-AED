import { haversineMeters } from './geo';
import type { Defibrillator } from './types';

/**
 * The same cabinet is often listed by several datasets. Records from extra
 * sources that sit within a few metres of one we already have (or share a
 * British Heart Foundation "Circuit" reference) are folded into it: the
 * existing record gains an "also listed by" note and any details it was
 * missing, and the duplicate is hidden.
 */

const CELL_LAT = 0.0005; // ≈ 55 m
const CELL_LNG = 0.0008; // ≈ 55 m at UK latitudes

const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL_LAT)}:${Math.floor(lng / CELL_LNG)}`;

export class ProximityIndex {
  private cells = new Map<string, Defibrillator[]>();
  private circuit = new Map<string, Defibrillator>();

  constructor(items: Iterable<Defibrillator> = []) {
    for (const d of items) this.add(d);
  }

  add(d: Defibrillator) {
    const k = cellKey(d.latitude, d.longitude);
    const list = this.cells.get(k);
    if (list) list.push(d);
    else this.cells.set(k, [d]);
    if (d.circuitRef) this.circuit.set(d.circuitRef, d);
  }

  /** Closest record within `maxM` metres (or with the same Circuit reference). */
  match(d: Defibrillator, maxM: number): Defibrillator | null {
    if (d.circuitRef) {
      const byRef = this.circuit.get(d.circuitRef);
      if (byRef) return byRef;
    }
    const y = Math.floor(d.latitude / CELL_LAT);
    const x = Math.floor(d.longitude / CELL_LNG);
    let best: Defibrillator | null = null;
    let bestM = maxM;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const c of this.cells.get(`${y + dy}:${x + dx}`) ?? []) {
          const m = haversineMeters(c, d);
          if (m <= bestM) {
            best = c;
            bestM = m;
          }
        }
      }
    }
    return best;
  }
}

export interface MergeResult {
  /** Records to show, keyed by id. */
  merged: Map<string, Defibrillator>;
  /** How many records from extra sources were recognised as duplicates. */
  duplicates: number;
}

/** Copy useful fields the existing record lacks from a duplicate. */
function enrich(base: Defibrillator, extra: Defibrillator): Defibrillator {
  const name = extra.sourceName ?? extra.source;
  const alsoIn = base.alsoIn?.includes(name) ? base.alsoIn : [...(base.alsoIn ?? []), name];
  return {
    ...base,
    alsoIn,
    name: base.name ?? extra.name,
    locationDescription: base.locationDescription ?? extra.locationDescription,
    address: base.address ?? extra.address,
    openingHours: base.openingHours ?? extra.openingHours,
    phone: base.phone ?? extra.phone,
    photoUrl: base.photoUrl ?? extra.photoUrl,
    pinCode: base.pinCode ?? extra.pinCode,
  };
}

/**
 * Merge a primary list (OpenStreetMap) with extra sources in priority order.
 * Records added on this device are always kept so the user sees what they added.
 */
export function mergeSources(primary: Iterable<Defibrillator>, extras: Defibrillator[][], maxM = 25): MergeResult {
  const merged = new Map<string, Defibrillator>();
  for (const d of primary) merged.set(d.id, d);
  const index = new ProximityIndex(merged.values());
  let duplicates = 0;
  for (const list of extras) {
    for (const d of list) {
      if (merged.has(d.id)) {
        merged.set(d.id, d); // same record from a fresher source
        continue;
      }
      const own = d.syncStatus != null;
      const hit = own ? null : index.match(d, maxM);
      if (hit) {
        const current = merged.get(hit.id) ?? hit;
        merged.set(hit.id, enrich(current, d));
        duplicates++;
      } else {
        merged.set(d.id, d);
        index.add(d);
      }
    }
  }
  return { merged, duplicates };
}
