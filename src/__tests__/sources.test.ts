/* eslint-disable @typescript-eslint/no-require-imports */
import { buildFeatures, isAllDay, passesFilters } from '../components/map/features';
import { mergeSources } from '../lib/dedupe';
import { haversineMeters, isInUK } from '../lib/geo';
import { buildMapStyle, safeFontName } from '../lib/mapStyles';
import { decodeSnapshot, encodeSnapshot, parseOpenAedMap, type AedSnapshot } from '../lib/sources/openAedMap';
import { parseCsv, parseCsvFeed, parseFeed, parseGeoJsonFeed, type FeedConfig } from '../lib/sources/feeds';
import { osgbToWgs84 } from '../lib/sources/osgb';
import { embedHtml, googleStreetViewEmbedUrl, mapillaryEmbedUrl } from '../lib/streetView';
import { boxAround, countTiles, estimateBytes, formatBytes, iterateTiles, latToTileY, lngToTileX } from '../lib/tileMath';
import type { Defibrillator } from '../lib/types';

const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-1.0836503, 51.083235] },
      properties: {
        '@osm_id': 13992619,
        '@osm_type': 'node',
        emergency: 'defibrillator',
        access: 'yes',
        indoor: 'no',
        'defibrillator:location': 'inside old red phone box',
        man_made: 'telephone_box',
        mapillary: '3844028222522084',
        check_date: '2024-05-01',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-0.12, 51.5] },
      properties: {
        '@osm_id': 42,
        '@osm_type': 'way',
        access: 'code',
        opening_hours: '24/7',
        description: '"Call 999 for access code"',
      },
    },
  ],
};

describe('OpenAEDMap national dataset', () => {
  it('maps OSM tags to the app model', () => {
    const [a, b] = parseOpenAedMap(geojson);
    expect(a).toMatchObject({
      id: 'osm:node/13992619',
      source: 'osm',
      sourceName: 'OpenStreetMap',
      latitude: 51.083235,
      longitude: -1.0836503,
      indoor: false,
      locationDescription: 'inside old red phone box',
      mapillaryId: '3844028222522084',
      checkDate: '2024-05-01',
    });
    // access=code means a locked cabinet; stray quotes are removed
    expect(b).toMatchObject({ id: 'osm:way/42', locked: true, locationDescription: 'Call 999 for access code' });
  });

  it('round-trips through the compact snapshot format', () => {
    const snap = encodeSnapshot(geojson, 'W/"x"', 123);
    expect(snap.rows[0][0]).toBe('n13992619');
    // Coordinates are stored to 6 decimal places (~10 cm).
    const r6 = (list: Defibrillator[]) =>
      list.map((d) => ({ ...d, latitude: Math.round(d.latitude * 1e6), longitude: Math.round(d.longitude * 1e6) }));
    expect(r6(decodeSnapshot(snap))).toEqual(r6(parseOpenAedMap(geojson)));
  });

  it('ships a valid bundled snapshot of every UK defibrillator', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(process.cwd(), 'assets/data/aeds-gb.dat');
    const snap = JSON.parse(fs.readFileSync(file, 'utf8')) as AedSnapshot;
    const all = decodeSnapshot(snap);
    expect(all.length).toBeGreaterThan(20_000);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    const outside = all.filter((d) => !isInUK(d));
    expect(outside.length / all.length).toBeLessThan(0.01);
  });
});

const feed = (id: string, format: FeedConfig['format'] = 'auto'): FeedConfig => ({ id, name: `Council ${id}`, url: 'https://x', format });

describe('open-data feeds', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\n"1, one","say ""hi"""\r\n2,two')).toEqual([
      ['a', 'b'],
      ['1, one', 'say "hi"'],
      ['2', 'two'],
    ]);
  });

  it('reads a council CSV with latitude/longitude columns', () => {
    const csv =
      'Row #,Location within building,Address line 1,Address line 2,Postcode,Latitude,Longitude\n' +
      "1,Duty officer's office,Aireborough Leisure Centre,The Green,LS20 9BT,53.872,-1.70708\n" +
      '2,Reception,Armley Leisure Centre,Carr Crofts,LS12 3HB,53.7959,-1.59247\n';
    const list = parseCsvFeed(feed('leeds'), csv);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({
      source: 'feed',
      sourceName: 'Council leeds',
      latitude: 53.7959,
      locationDescription: 'Reception',
      indoor: true,
    });
    expect(list[1].address).toContain('Armley Leisure Centre');
  });

  it('converts OS grid eastings/northings', () => {
    const csv = 'Site,Easting,Northing,Available 24/7\nTrafalgar,530034,180381,Yes\n';
    const [d] = parseFeed(feed('grid'), csv);
    expect(haversineMeters(d, { latitude: 51.507407, longitude: -0.127724 })).toBeLessThan(20);
    expect(d.openingHours).toBe('24/7');
    expect(d.name).toBe('Trafalgar');
    const far = osgbToWgs84(651409.903, 313177.27);
    expect(haversineMeters(far, { latitude: 52.657979, longitude: 1.716052 })).toBeLessThan(20);
  });

  it('reads GeoJSON points and multipoints', () => {
    const list = parseGeoJsonFeed(feed('g', 'geojson'), {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[-0.49, 51.37]] }, properties: { location_name: 'Day Centre, KT15 2AN' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-2.39, 53.45] }, properties: { Location: 'School', Notes: 'Via 999' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'Paris – outside the UK' } },
      ],
    });
    expect(list.map((d) => d.name)).toEqual(['Day Centre, KT15 2AN', 'School']);
    expect(list[1].locationDescription).toBe('Via 999');
  });

  it('rejects files without coordinates', () => {
    expect(() => parseFeed(feed('bad'), 'name,town\nA,B\n')).toThrow(/latitude/);
  });
});

describe('merging sources', () => {
  const osm: Defibrillator = { id: 'osm:node/1', source: 'osm', latitude: 53.8, longitude: -1.5, sourceName: 'OpenStreetMap' };
  it('folds near-duplicates into the OpenStreetMap record', () => {
    const dup: Defibrillator = {
      id: 'feed:leeds/x',
      source: 'feed',
      sourceName: 'Leeds City Council',
      latitude: 53.80005,
      longitude: -1.50005,
      phone: '0113',
      address: '1 High St',
    };
    const other: Defibrillator = { id: 'feed:leeds/y', source: 'feed', sourceName: 'Leeds City Council', latitude: 53.81, longitude: -1.5 };
    const { merged, duplicates } = mergeSources([osm], [[dup, other]]);
    expect(duplicates).toBe(1);
    expect(merged.size).toBe(2);
    expect(merged.get('osm:node/1')).toMatchObject({ alsoIn: ['Leeds City Council'], phone: '0113', address: '1 High St' });
  });

  it('always keeps units the user added', () => {
    const mine: Defibrillator = { id: 'community:1', source: 'community', latitude: 53.8, longitude: -1.5, syncStatus: 'pending' };
    expect(mergeSources([osm], [[mine]]).merged.has('community:1')).toBe(true);
  });

  it('matches on the Circuit reference', () => {
    const a = { ...osm, circuitRef: 'ABC' };
    const b: Defibrillator = { id: 'feed:x/1', source: 'feed', latitude: 53.9, longitude: -1.5, circuitRef: 'ABC' };
    expect(mergeSources([a], [[b]]).duplicates).toBe(1);
  });
});

describe('map filters', () => {
  const d = (over: Partial<Defibrillator>): Defibrillator => ({ id: 'x', source: 'osm', latitude: 51, longitude: 0, ...over });
  const opts = { showClosed: true, showUnknown: true, showRestricted: false, quick: { openNow: false, allDay: false, noCode: false } };

  it('recognises 24/7 units', () => {
    expect(isAllDay(d({ openingHours: '24/7' }))).toBe(true);
    expect(isAllDay(d({ indoor: false }))).toBe(true);
    expect(isAllDay(d({ openingHours: 'Mo-Fr 09:00-17:00' }))).toBe(false);
  });

  it('applies the quick filters and settings', () => {
    expect(passesFilters(d({}), 'restricted', opts)).toBe(false);
    expect(passesFilters(d({}), 'closed', { ...opts, quick: { ...opts.quick, openNow: true } })).toBe(false);
    expect(passesFilters(d({ locked: true }), 'available', { ...opts, quick: { ...opts.quick, noCode: true } })).toBe(false);
    expect(passesFilters(d({ locked: true, pinCode: '1234' }), 'available', { ...opts, quick: { ...opts.quick, noCode: true } })).toBe(true);
  });

  it('builds clustered-source GeoJSON', () => {
    const fc = buildFeatures([d({ id: 'a' }), d({ id: 'b', access: 'private' })], (x) => (x.access ? 'restricted' : 'available'), opts);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ id: 'a', s: 'available', src: 'osm' });
    expect(fc.features[0].geometry.coordinates).toEqual([0, 51]);
  });
});

describe('map styles', () => {
  it('builds every style', () => {
    for (const id of ['streets', 'light', 'dark', 'satellite', 'hybrid'] as const) {
      const s = buildMapStyle(id);
      expect(s.version).toBe(8);
      expect(s.layers.length).toBeGreaterThan(1);
      expect(s.glyphs).toContain('{fontstack}');
    }
    const hybrid = buildMapStyle('hybrid');
    expect(hybrid.layers[1]).toMatchObject({ id: 'imagery', type: 'raster' });
    expect(hybrid.layers.some((l) => l.type === 'symbol')).toBe(true);
  });

  it('drops 3D buildings unless asked for', () => {
    expect(buildMapStyle('streets').layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
    expect(buildMapStyle('streets', { buildings3d: true }).layers.some((l) => l.type === 'fill-extrusion')).toBe(true);
  });

  it('points an offline style at files on the phone', () => {
    const fontMap = { 'Noto Sans Regular': 'NotoSansRegular', 'Noto Sans Bold': 'NotoSansBold', 'Noto Sans Italic': 'NotoSansItalic' };
    const s = buildMapStyle('streets', {
      offline: {
        tiles: 'file:///d/tiles/{z}/{x}/{y}.pbf',
        glyphs: 'file:///d/fonts/{fontstack}/{range}.pbf',
        sprite: 'file:///d/sprites/ofm',
        fontMap,
      },
    });
    expect(s.sources.openmaptiles).toMatchObject({ type: 'vector', tiles: ['file:///d/tiles/{z}/{x}/{y}.pbf'], maxzoom: 14 });
    expect(s.sources.ne2_shaded).toBeUndefined();
    expect(s.glyphs).toBe('file:///d/fonts/{fontstack}/{range}.pbf');
    expect(JSON.stringify(s)).not.toContain('Noto Sans');
    expect(JSON.stringify(s)).not.toContain('https://');
    expect(safeFontName('Noto Sans Bold')).toBe('NotoSansBold');
  });
});

describe('offline tile maths', () => {
  it('converts coordinates to tiles', () => {
    expect(lngToTileX(-0.1278, 14)).toBe(8186);
    expect(latToTileY(51.5074, 14)).toBe(5448);
    expect(lngToTileX(-180, 3)).toBe(0);
  });

  it('counts the tiles in an area', () => {
    const box = boxAround(51.5074, -0.1278, 5000);
    const n = countTiles(box, 0, 14);
    expect(n).toBe(Array.from(iterateTiles(box, 0, 14)).length);
    expect(n).toBeGreaterThan(80);
    expect(n).toBeLessThan(200);
    expect(estimateBytes(box, 0, 14)).toBeGreaterThan(1_000_000);
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('in-app Street View', () => {
  it('uses the keyless embed, or the Embed API when a key is set', () => {
    const p = { latitude: 51.50101, longitude: -0.14189 };
    expect(googleStreetViewEmbedUrl(p)).toBe('https://www.google.com/maps?layer=c&cbll=51.501010,-0.141890&cbp=11,0,0,0,0&output=svembed');
    expect(googleStreetViewEmbedUrl(p, 'KEY')).toContain('/maps/embed/v1/streetview?key=KEY&location=51.501010,-0.141890');
    expect(mapillaryEmbedUrl('123')).toBe('https://www.mapillary.com/embed?image_key=123&style=photo');
  });

  it('wraps the viewer in an iframe page', () => {
    const html = embedHtml('https://example.com/?a=1&b="2"');
    expect(html).toContain('<iframe src="https://example.com/?a=1&amp;b=&quot;2&quot;"');
  });
});
