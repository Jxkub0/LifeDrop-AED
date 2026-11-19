#!/usr/bin/env node
/**
 * Downloads the latest UK defibrillator dataset from OpenAEDMap and writes the
 * compact snapshot that ships inside the app (assets/data/aeds-gb.dat), so the
 * map has every known defibrillator from the very first launch – even offline.
 *
 *   node scripts/build-aed-snapshot.js            # download
 *   node scripts/build-aed-snapshot.js GB.geojson # use a file you already have
 *
 * Keep TAGS in sync with USED_OSM_TAGS in src/lib/osm.ts.
 * Data © OpenStreetMap contributors (ODbL).
 */
const fs = require('fs');
const path = require('path');

const URL = 'https://openaedmap.org/api/v1/countries/GB.geojson';
const OUT = path.join(__dirname, '..', 'assets', 'data', 'aeds-gb.dat');
const TAGS = [
  'name',
  'operator',
  'defibrillator:location',
  'defibrillator:location:en',
  'aed:location',
  'description',
  'opening_hours',
  'access',
  'indoor',
  'locked',
  'lock',
  'defibrillator:lock',
  'cabinet:lock',
  'defibrillator:code',
  'access:code',
  'emergency:phone',
  'phone',
  'contact:phone',
  'level',
  'ref:GB:the_circuit',
  'image',
  'mapillary',
  'panoramax',
  'check_date',
  'survey:date',
];
const LETTER = { node: 'n', way: 'w', relation: 'r' };

async function main() {
  let json;
  let etag = null;
  const file = process.argv[2];
  if (file) {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    const res = await fetch(URL, { headers: { 'User-Agent': 'UKLifeDropAED-build/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    etag = res.headers.get('etag');
    json = await res.json();
  }
  const rows = [];
  for (const f of json.features) {
    const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
    const p = f.properties;
    if (!c || !p || p['@osm_id'] == null) continue;
    const row = [`${LETTER[p['@osm_type']] || 'n'}${p['@osm_id']}`, Math.round(c[1] * 1e6) / 1e6, Math.round(c[0] * 1e6) / 1e6];
    TAGS.forEach((k, i) => {
      const v = p[k];
      if ((typeof v === 'string' && v) || typeof v === 'number') row.push(i, String(v));
    });
    rows.push(row);
  }
  // The bundled copy never claims an ETag, so the first online launch always checks for newer data.
  const snap = { v: 1, etag: null, updatedAt: Date.now(), tags: TAGS, rows };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snap));
  console.log(`Wrote ${rows.length} defibrillators to ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)${etag ? ` etag ${etag}` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
