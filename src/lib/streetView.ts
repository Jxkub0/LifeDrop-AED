import type { LatLng } from './types';

/**
 * In-app street-level imagery.
 *
 * Google Street View is shown with Google's embeddable viewer inside the app.
 * With a Maps Embed API key (EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY) the official
 * Embed API is used; without one, Google's keyless Street View embed is used.
 * Mapillary photos are used where OpenStreetMap links one to the defibrillator.
 */

const c = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

export function googleStreetViewEmbedUrl(p: LatLng, apiKey?: string, heading = 0): string {
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(apiKey)}&location=${c(p)}&heading=${Math.round(heading)}&pitch=0&fov=90`;
  }
  return `https://www.google.com/maps?layer=c&cbll=${c(p)}&cbp=11,${Math.round(heading)},0,0,0&output=svembed`;
}

export function mapillaryEmbedUrl(imageId: string): string {
  return `https://www.mapillary.com/embed?image_key=${encodeURIComponent(imageId)}&style=photo`;
}

export function mapillaryWebUrl(imageId: string): string {
  return `https://www.mapillary.com/app/?pKey=${encodeURIComponent(imageId)}&focus=photo`;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Host page for an embeddable viewer (both viewers refuse to run outside an iframe). */
export function embedHtml(src: string, background = '#000000'): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:${background};overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe src="${escapeAttr(src)}" allow="accelerometer; gyroscope; fullscreen" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></body></html>`;
}

/** Origin the viewer page is served from (also what an Embed API key should be restricted to). */
export const EMBED_ORIGIN = 'https://uklifedrop.app/';
