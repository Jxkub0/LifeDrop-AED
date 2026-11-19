import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-react-native';
import darkJson from './styles/dark.json';
import libertyJson from './styles/liberty.json';
import positronJson from './styles/positron.json';

/**
 * Map styles. Vector maps come from OpenFreeMap (free, no API key, OpenStreetMap
 * data). The three OpenFreeMap styles are bundled with the app so the map draws
 * immediately without first downloading a style file. Satellite imagery is
 * Esri World Imagery.
 */

export type MapStyleId = 'streets' | 'light' | 'dark' | 'satellite' | 'hybrid';

export interface MapStyleInfo {
  id: MapStyleId;
  label: string;
  description: string;
  /** Can be shown from downloaded offline maps. */
  offline: boolean;
}

export const MAP_STYLES: MapStyleInfo[] = [
  { id: 'streets', label: 'Default', description: 'Detailed street map', offline: true },
  { id: 'satellite', label: 'Satellite', description: 'Aerial photos', offline: false },
  { id: 'hybrid', label: 'Hybrid', description: 'Aerial photos with street names', offline: false },
  { id: 'light', label: 'Light', description: 'Clean, low-detail map', offline: true },
  { id: 'dark', label: 'Dark', description: 'Easy on the eyes at night', offline: true },
];

export const OPENFREEMAP = {
  tilejson: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  /** Fonts used by the bundled styles (and by the app's own cluster labels). */
  fonts: ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'],
  /** Glyph ranges needed for English, Welsh, Scottish and Irish Gaelic place names. */
  glyphRanges: ['0-255', '256-511', '8192-8447'],
  maxzoom: 14,
  attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
};

export const ESRI_IMAGERY = {
  tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery: Esri, Vantor/Maxar, Earthstar Geographics, and the GIS User Community',
  maxzoom: 19,
};

/** Font used for the app's own labels (cluster counts). Present in every style. */
export const LABEL_FONT = ['Noto Sans Bold'];

/** Where downloaded offline map files live (file:// URLs). */
export interface OfflineRefs {
  tiles: string;
  glyphs: string;
  sprite: string;
  /** Font names → file-system-safe names used in the glyph folder. */
  fontMap: Record<string, string>;
}

export interface StyleOptions {
  buildings3d?: boolean;
  pointsOfInterest?: boolean;
  /** Use downloaded files instead of the internet (vector styles only). */
  offline?: OfflineRefs | null;
  /** Override the satellite tile URL (e.g. a commercial provider with an API key). */
  satelliteTiles?: string | null;
  satelliteAttribution?: string | null;
}

const BASE: Record<'streets' | 'light' | 'dark', StyleSpecification> = {
  streets: libertyJson as unknown as StyleSpecification,
  light: positronJson as unknown as StyleSpecification,
  dark: darkJson as unknown as StyleSpecification,
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const safeFontName = (font: string) => font.replace(/[^A-Za-z0-9]/g, '');

/** Rename fonts inside a text-font value (plain array or expression). */
function renameFonts(value: unknown, map: Record<string, string>): unknown {
  if (typeof value === 'string') return map[value] ?? value;
  if (Array.isArray(value)) return value.map((v) => renameFonts(v, map));
  return value;
}

function vectorStyle(id: 'streets' | 'light' | 'dark', opts: StyleOptions): StyleSpecification {
  const style = clone(BASE[id]);
  let layers = style.layers;
  if (!opts.buildings3d) layers = layers.filter((l) => l.type !== 'fill-extrusion');
  if (opts.pointsOfInterest === false) layers = layers.filter((l) => !l.id.startsWith('poi'));

  const off = opts.offline;
  if (off) {
    // The low-zoom shaded-relief raster is not downloaded.
    delete (style.sources as Record<string, unknown>).ne2_shaded;
    layers = layers.filter((l) => !('source' in l) || l.source !== 'ne2_shaded');
    style.sources.openmaptiles = {
      type: 'vector',
      tiles: [off.tiles],
      minzoom: 0,
      maxzoom: OPENFREEMAP.maxzoom,
      attribution: OPENFREEMAP.attribution,
    };
    style.glyphs = off.glyphs;
    style.sprite = off.sprite;
    layers = layers.map((l) => {
      if (l.type !== 'symbol' || !l.layout?.['text-font']) return l;
      return {
        ...l,
        layout: { ...l.layout, 'text-font': renameFonts(l.layout['text-font'], off.fontMap) },
      } as LayerSpecification;
    });
  }
  style.layers = layers;
  return style;
}

function satelliteStyle(withLabels: boolean, opts: StyleOptions): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    name: withLabels ? 'Hybrid' : 'Satellite',
    glyphs: OPENFREEMAP.glyphs,
    sprite: OPENFREEMAP.sprite,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [opts.satelliteTiles || ESRI_IMAGERY.tiles],
        tileSize: 256,
        maxzoom: ESRI_IMAGERY.maxzoom,
        attribution: opts.satelliteAttribution || ESRI_IMAGERY.attribution,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1b2430' } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
    ],
  };
  if (withLabels) {
    const base = BASE.streets;
    style.sources.openmaptiles = base.sources.openmaptiles;
    const roads = base.layers.filter(
      (l) => l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'transportation' && /highway_(major|motorway|trunk|primary|secondary)/.test(l.id) && !/casing/.test(l.id),
    );
    const labels = base.layers.filter(
      (l) => l.type === 'symbol' && !l.id.startsWith('poi') && !l.id.includes('shield') && !l.id.includes('one_way'),
    );
    for (const l of roads) {
      style.layers.push({
        ...(l as LayerSpecification & { paint?: Record<string, unknown> }),
        paint: { ...((l as { paint?: Record<string, unknown> }).paint ?? {}), 'line-opacity': 0.55 },
      } as LayerSpecification);
    }
    for (const l of labels) {
      const paint = { ...((l as { paint?: Record<string, unknown> }).paint ?? {}) };
      paint['text-color'] = '#ffffff';
      paint['text-halo-color'] = 'rgba(0,0,0,0.85)';
      paint['text-halo-width'] = 1.4;
      style.layers.push({ ...l, paint } as LayerSpecification);
    }
  }
  return style;
}

/** Build the MapLibre style for the chosen map type. */
export function buildMapStyle(id: MapStyleId, opts: StyleOptions = {}): StyleSpecification {
  if (id === 'satellite') return satelliteStyle(false, opts);
  if (id === 'hybrid') return satelliteStyle(true, opts);
  return vectorStyle(id, opts);
}

/** Style id to fall back to when a style needs the internet but we are offline. */
export function offlineFallback(id: MapStyleId): MapStyleId {
  return id === 'satellite' || id === 'hybrid' ? 'streets' : id;
}

export function attributionFor(id: MapStyleId): string {
  if (id === 'satellite') return ESRI_IMAGERY.attribution;
  if (id === 'hybrid') return `${ESRI_IMAGERY.attribution} · ${OPENFREEMAP.attribution}`;
  return OPENFREEMAP.attribution;
}
