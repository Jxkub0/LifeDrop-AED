export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Where a defibrillator record came from:
 * - osm: OpenStreetMap (via the OpenAEDMap national download or a live Overpass query)
 * - community: added by a user of this app (synced through Firebase)
 * - feed: an open-data feed such as a council dataset or a custom GeoJSON/CSV URL
 */
export type DefibSource = 'osm' | 'community' | 'feed';

/** The three access types offered when a user adds a defibrillator. */
export type AccessType = '24/7' | 'restricted' | 'business_hours';

export type SyncStatus = 'pending' | 'synced' | 'failed';

/** Normalised defibrillator record used everywhere in the app. */
export interface Defibrillator {
  /** Stable id, e.g. "osm:node/123" or "community:<uuid>". */
  id: string;
  source: DefibSource;
  latitude: number;
  longitude: number;
  /** Name of the site or operator, if known. */
  name?: string;
  /** Plain-English description of where the unit is mounted. */
  locationDescription?: string;
  /** Raw opening hours in OpenStreetMap syntax ("24/7", "Mo-Fr 09:00-17:00"...). */
  openingHours?: string;
  /** OSM access tag value (yes, permissive, customers, private, no...). */
  access?: string;
  /** true = inside a building, false = outdoor cabinet, undefined = not recorded. */
  indoor?: boolean;
  /** Cabinet has a keypad / lock. */
  locked?: boolean;
  /** Keypad code, if one has been shared. */
  pinCode?: string;
  phone?: string;
  operator?: string;
  level?: string;
  /** British Heart Foundation "The Circuit" reference, when tagged in OSM. */
  circuitRef?: string;
  photoUrl?: string;
  contact?: string;
  accessType?: AccessType;
  /** Epoch ms when added by a community member. */
  createdAt?: number;
  /** Local-only: sync state of a submission made on this device. */
  syncStatus?: SyncStatus;
  /** Human-readable name of the dataset, e.g. "OpenStreetMap" or "Leeds City Council". */
  sourceName?: string;
  /** Other datasets that list the same unit (filled in when duplicates are merged). */
  alsoIn?: string[];
  /** When the details were last checked on the ground (YYYY-MM-DD), if recorded. */
  checkDate?: string;
  /** Mapillary street-level image id showing the unit. */
  mapillaryId?: string;
  /** Panoramax street-level image id showing the unit. */
  panoramaxId?: string;
  /** Postal address, when the dataset provides one. */
  address?: string;
}

export type AvailabilityStatus = 'available' | 'closed' | 'restricted' | 'unknown';

export interface Availability {
  status: AvailabilityStatus;
  /** Short label for badges, e.g. "Available now". */
  label: string;
  /** One-line explanation, e.g. "Open until 17:00" or "Outdoor cabinet – usually 24/7". */
  detail: string;
  /** True when the status is a reasonable assumption rather than stated opening hours. */
  assumed: boolean;
  /** When the current state ends (closing or opening time), if known and within a week. */
  changesAt?: Date;
}

export interface DefibWithMeta extends Defibrillator {
  availability: Availability;
  /** Straight-line distance from the reference point in metres. */
  distanceM?: number;
  /** Bearing from the reference point in degrees (0 = north). */
  bearingDeg?: number;
}
