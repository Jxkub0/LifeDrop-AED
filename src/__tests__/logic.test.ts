import { evaluateAvailability } from '../lib/availability';
import { bearingDegrees, compassDirection, formatDistance, haversineMeters, walkingMinutes } from '../lib/geo';
import { guessRegion, makeHolidayLookup, parseGovUkHolidays, regionFromCountry } from '../lib/holidays';
import {
  appleMapsDirectionsUrl,
  googleMapsDirectionsUrl,
  streetViewUrl,
  wazeUrl,
  what3wordsAppUrl,
} from '../lib/links';
import { findNearestAvailable } from '../lib/nearest';
import { buildOverpassQuery, elementToDefib, parseOverpassResponse, tileBounds, tileKeyFor, tilesForBounds } from '../lib/osm';
import { __resetOverpassState, runOverpassQuery } from '../lib/overpass';
import { normalisePostcode, searchLocation } from '../lib/search';
import type { Defibrillator } from '../lib/types';
import { buildVoiceMessage, spellOut } from '../lib/voice';

const noHolidays = () => false;
const mondayNoon = new Date(2026, 10, 16, 12, 0);
const mondayNight = new Date(2026, 10, 16, 23, 0);

const LONDON_EYE = { latitude: 51.5033, longitude: -0.1196 };
const BIG_BEN = { latitude: 51.5007, longitude: -0.1246 };

describe('geo', () => {
  it('computes Haversine distance', () => {
    const d = haversineMeters(LONDON_EYE, BIG_BEN);
    expect(d).toBeGreaterThan(440);
    expect(d).toBeLessThan(470);
    // London → Edinburgh ≈ 534 km
    const edinburgh = { latitude: 55.9533, longitude: -3.1883 };
    expect(haversineMeters({ latitude: 51.5074, longitude: -0.1278 }, edinburgh) / 1000).toBeCloseTo(534, -1);
  });

  it('computes compass bearing and direction', () => {
    const north = { latitude: 51.51, longitude: -0.1196 };
    expect(bearingDegrees(LONDON_EYE, north)).toBeCloseTo(0, 0);
    expect(compassDirection(bearingDegrees(LONDON_EYE, BIG_BEN))).toBe('south-west');
    expect(compassDirection(359)).toBe('north');
    expect(compassDirection(90)).toBe('east');
  });

  it('formats distance in metres and yards', () => {
    expect(formatDistance(240).both).toBe('240 metres (260 yards)');
    expect(formatDistance(42).metric).toBe('40 metres');
    expect(formatDistance(1500).metric).toBe('1.5 km');
    expect(formatDistance(3000).imperial).toBe('1.9 miles');
  });

  it('estimates walking time', () => {
    expect(walkingMinutes(10)).toBe(1);
    expect(walkingMinutes(400)).toBe(6);
  });
});

describe('availability engine', () => {
  it('marks 24/7 units available', () => {
    const a = evaluateAvailability({ openingHours: '24/7' }, mondayNight, noHolidays);
    expect(a.status).toBe('available');
    expect(a.assumed).toBe(false);
  });

  it('marks business-hours units closed at night with the next opening time', () => {
    const a = evaluateAvailability({ openingHours: 'Mo-Fr 09:00-17:00' }, mondayNight, noHolidays);
    expect(a.status).toBe('closed');
    expect(a.detail).toBe('Opens 09:00 tomorrow');
  });

  it('shows the closing time while open', () => {
    const a = evaluateAvailability({ openingHours: 'Mo-Fr 09:00-17:00' }, mondayNoon, noHolidays);
    expect(a.status).toBe('available');
    expect(a.detail).toBe('Open until 17:00');
  });

  it('treats private access as restricted', () => {
    expect(evaluateAvailability({ access: 'private', openingHours: '24/7' }, mondayNoon, noHolidays).status).toBe(
      'restricted',
    );
  });

  it('assumes outdoor cabinets without hours are available', () => {
    const a = evaluateAvailability({ indoor: false }, mondayNight, noHolidays);
    expect(a.status).toBe('available');
    expect(a.assumed).toBe(true);
  });

  it('reports unknown when hours are missing or unparseable', () => {
    expect(evaluateAvailability({ indoor: true }, mondayNoon, noHolidays).status).toBe('unknown');
    expect(evaluateAvailability({}, mondayNoon, noHolidays).status).toBe('unknown');
    expect(evaluateAvailability({ openingHours: 'sunrise-sunset' }, mondayNoon, noHolidays).status).toBe('unknown');
  });
});

describe('UK bank holidays', () => {
  it('maps countries and guesses regions', () => {
    expect(regionFromCountry('Wales')).toBe('england-and-wales');
    expect(regionFromCountry('Scotland')).toBe('scotland');
    expect(regionFromCountry('Northern Ireland')).toBe('northern-ireland');
    expect(regionFromCountry('France')).toBeNull();
    expect(guessRegion({ latitude: 54.597, longitude: -5.93 })).toBe('northern-ireland'); // Belfast
    expect(guessRegion({ latitude: 55.953, longitude: -3.188 })).toBe('scotland'); // Edinburgh
    expect(guessRegion({ latitude: 55.07, longitude: -3.6 })).toBe('scotland'); // Dumfries
    expect(guessRegion({ latitude: 54.89, longitude: -2.93 })).toBe('england-and-wales'); // Carlisle
    expect(guessRegion({ latitude: 55.77, longitude: -2.0 })).toBe('england-and-wales'); // Berwick
    expect(guessRegion({ latitude: 51.48, longitude: -3.18 })).toBe('england-and-wales'); // Cardiff
  });

  it('uses the bundled gov.uk data', () => {
    const ew = makeHolidayLookup('england-and-wales');
    expect(ew(new Date(2026, 11, 25))).toBe(true); // Christmas Day
    expect(ew(new Date(2026, 11, 24))).toBe(false);
    const sc = makeHolidayLookup('scotland');
    expect(sc(new Date(2026, 10, 30))).toBe(true); // St Andrew's Day (Mon 30 Nov 2026)
    expect(ew(new Date(2026, 10, 30))).toBe(false);
    expect(ew(new Date(2035, 0, 1))).toBeNull(); // beyond the data
  });

  it('parses the gov.uk payload', () => {
    const table = parseGovUkHolidays({
      'england-and-wales': { events: [{ date: '2027-01-01' }] },
      scotland: { events: [{ date: '2027-01-02' }] },
      'northern-ireland': { events: [] },
    });
    expect(table?.scotland).toEqual(['2027-01-02']);
    expect(parseGovUkHolidays({})).toBeNull();
  });
});

describe('OSM / Overpass mapping', () => {
  it('tiles round-trip', () => {
    const key = tileKeyFor(LONDON_EYE);
    const b = tileBounds(key);
    expect(LONDON_EYE.latitude).toBeGreaterThanOrEqual(b.south);
    expect(LONDON_EYE.latitude).toBeLessThan(b.north);
    expect(LONDON_EYE.longitude).toBeGreaterThanOrEqual(b.west);
    expect(LONDON_EYE.longitude).toBeLessThan(b.east);
    expect(tilesForBounds({ south: 50, north: 52, west: -2, east: 0 })).toBeNull(); // too wide
  });

  it('builds a valid Overpass QL query', () => {
    const q = buildOverpassQuery([tileKeyFor(LONDON_EYE)]);
    expect(q).toContain('[out:json]');
    expect(q).toContain('nwr["emergency"="defibrillator"]');
    expect(q.trim().endsWith('out center;')).toBe(true);
  });

  it('maps tags to the defibrillator model', () => {
    const d = elementToDefib({
      type: 'node',
      id: 6312678472,
      lat: 52.9480644,
      lon: -1.4208042,
      tags: {
        access: 'yes',
        'defibrillator:location': 'On wall outside the Co-op',
        emergency: 'defibrillator',
        indoor: 'no',
        opening_hours: '24/7',
        'ref:GB:the_circuit': '7A43D245',
        lock: 'keypad',
      },
    })!;
    expect(d.id).toBe('osm:node/6312678472');
    expect(d.locationDescription).toBe('On wall outside the Co-op');
    expect(d.indoor).toBe(false);
    expect(d.locked).toBe(true);
    expect(d.circuitRef).toBe('7A43D245');
  });

  it('uses the centre of ways and skips non-defibrillators', () => {
    const list = parseOverpassResponse({
      elements: [
        { type: 'way', id: 1, center: { lat: 51, lon: -1 }, tags: { emergency: 'defibrillator' } },
        { type: 'node', id: 2, lat: 51, lon: -1, tags: { amenity: 'cafe' } },
        { type: 'node', id: 3, tags: { emergency: 'defibrillator' } },
      ],
    });
    expect(list.map((d) => d.id)).toEqual(['osm:way/1']);
  });
});

describe('Overpass client', () => {
  beforeEach(() => __resetOverpassState());

  it('falls back to the next mirror on 429 and sends a User-Agent', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('first')) return new Response('busy', { status: 429 });
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    });
    const json = await runOverpassQuery('[out:json];', {
      endpoints: ['https://first/api', 'https://second/api'],
      userAgent: 'Test/1.0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(json).toEqual({ elements: [] });
    expect(calls.map((c) => c.url)).toEqual(['https://first/api', 'https://second/api']);
    expect((calls[1].init?.headers as Record<string, string>)['User-Agent']).toBe('Test/1.0');
    expect(String(calls[1].init?.body)).toBe('data=%5Bout%3Ajson%5D%3B');
  });

  it('treats an Overpass runtime-error remark as a failure', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }), { status: 200 }),
    );
    await expect(
      runOverpassQuery('x', { endpoints: ['https://a'], userAgent: 'T', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/timed out/);
  });
});

describe('find closest available', () => {
  const base: Omit<Defibrillator, 'id' | 'latitude' | 'longitude'> = { source: 'osm' };
  const user = { latitude: 51.5, longitude: -0.12 };
  const offset = (metresNorth: number) => ({ latitude: 51.5 + metresNorth / 111_320, longitude: -0.12 });

  it('skips closed units and picks the nearest open one', () => {
    const defibs: Defibrillator[] = [
      { ...base, id: 'closed', ...offset(50), openingHours: 'Mo-Fr 09:00-17:00' },
      { ...base, id: 'far', ...offset(900), openingHours: '24/7' },
      { ...base, id: 'near', ...offset(300), openingHours: '24/7' },
      { ...base, id: 'private', ...offset(10), openingHours: '24/7', access: 'private' },
    ];
    const r = findNearestAvailable(defibs, user, mondayNight, noHolidays, 3000);
    expect(r.best?.id).toBe('near');
    expect(r.usedUnconfirmed).toBe(false);
    expect(Math.round(r.best!.distanceM!)).toBe(300);
  });

  it('flags a much closer unit with unconfirmed hours', () => {
    const defibs: Defibrillator[] = [
      { ...base, id: 'unknown', ...offset(60) },
      { ...base, id: 'open', ...offset(800), openingHours: '24/7' },
    ];
    const r = findNearestAvailable(defibs, user, mondayNight, noHolidays, 3000);
    expect(r.best?.id).toBe('open');
    expect(r.closerUnconfirmed?.id).toBe('unknown');
  });

  it('falls back to unconfirmed units when nothing is confirmed open', () => {
    const defibs: Defibrillator[] = [
      { ...base, id: 'unknown', ...offset(400), indoor: true },
      { ...base, id: 'closed', ...offset(100), openingHours: 'Mo-Fr 09:00-17:00' },
    ];
    const r = findNearestAvailable(defibs, user, mondayNight, noHolidays, 3000);
    expect(r.best?.id).toBe('unknown');
    expect(r.usedUnconfirmed).toBe(true);
  });

  it('returns nothing outside the search radius', () => {
    const r = findNearestAvailable([{ ...base, id: 'x', ...offset(5000), openingHours: '24/7' }], user, mondayNight, noHolidays, 3000);
    expect(r.best).toBeNull();
  });
});

describe('postcode search', () => {
  it('normalises postcodes', () => {
    expect(normalisePostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(normalisePostcode(' M1 1AE ')).toBe('M1 1AE');
    expect(normalisePostcode('London')).toBeNull();
  });

  it('looks up a full postcode on postcodes.io', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      expect(url).toBe('https://api.postcodes.io/postcodes/SW1A%201AA');
      return new Response(
        JSON.stringify({ status: 200, result: { postcode: 'SW1A 1AA', latitude: 51.50101, longitude: -0.141563, country: 'England' } }),
        { status: 200 },
      );
    });
    const r = await searchLocation('sw1a 1aa', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ latitude: 51.50101, longitude: -0.141563, label: 'SW1A 1AA', country: 'England' });
  });

  it('falls back to the device geocoder', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ status: 200, result: [] }), { status: 200 }));
    const r = await searchLocation('Nowhereville', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      deviceGeocode: async () => ({ latitude: 1, longitude: 2 }),
    });
    expect(r).toEqual({ latitude: 1, longitude: 2, label: 'Nowhereville' });
  });
});

describe('deep links', () => {
  const p = { latitude: 51.5033, longitude: -0.1196 };
  it('builds Street View, directions and what3words URLs', () => {
    expect(streetViewUrl(p)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=51.503300,-0.119600');
    expect(googleMapsDirectionsUrl(p, 'walking')).toContain('travelmode=walking');
    expect(appleMapsDirectionsUrl(p, 'walking')).toContain('dirflg=w');
    expect(appleMapsDirectionsUrl(p, 'driving')).toContain('dirflg=d');
    expect(wazeUrl(p)).toContain('ll=51.503300,-0.119600&navigate=yes');
    expect(what3wordsAppUrl('filled.count.soap')).toBe('w3w://show?threewords=filled.count.soap');
  });
});

describe('voice guidance', () => {
  it('spells out the PIN digit by digit', () => {
    expect(spellOut('C 1234')).toBe('C, 1, 2, 3, 4');
  });

  it('includes distance, direction and code', () => {
    const msg = buildVoiceMessage({
      id: 'x',
      source: 'community',
      latitude: 0,
      longitude: 0,
      pinCode: '1234',
      locationDescription: 'Outside the post office',
      distanceM: 240,
      bearingDeg: 45,
      availability: { status: 'available', label: 'Available now', detail: '', assumed: false },
    });
    expect(msg).toContain('240 metres to the north-east');
    expect(msg).toContain('1, 2, 3, 4');
    expect(msg).toContain('call 999');
  });
});
