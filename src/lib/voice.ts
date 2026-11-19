import { compassDirection, formatDistance, walkingMinutes } from './geo';
import type { DefibWithMeta } from './types';

/** "1234" → "1, 2, 3, 4" so text-to-speech reads each digit separately. */
export function spellOut(code: string): string {
  return code
    .replace(/\s+/g, '')
    .split('')
    .map((c) => (c === '#' ? 'hash' : c === '*' ? 'star' : c.toUpperCase()))
    .join(', ');
}

/** Sentence read aloud when a defibrillator is selected and voice guidance is on. */
export function buildVoiceMessage(defib: DefibWithMeta): string {
  const parts: string[] = [];
  const status = defib.availability.status;

  if (status === 'available') parts.push('Defibrillator available now.');
  else if (status === 'closed') parts.push('This defibrillator is closed right now.');
  else if (status === 'restricted') parts.push('This defibrillator is not for public use.');
  else parts.push('This defibrillator may not be accessible. Its opening hours are not confirmed.');

  if (defib.distanceM !== undefined) {
    const d = formatDistance(defib.distanceM);
    const dir = defib.bearingDeg !== undefined ? ` to the ${compassDirection(defib.bearingDeg)}` : '';
    const mins = walkingMinutes(defib.distanceM);
    parts.push(`It is about ${d.metric}${dir}. That is roughly ${mins} ${mins === 1 ? 'minute' : 'minutes'} on foot.`);
  }
  if (defib.locationDescription) parts.push(`Location: ${defib.locationDescription}.`);
  if (defib.pinCode) {
    parts.push(`The cabinet code is ${spellOut(defib.pinCode)}. Again, the code is ${spellOut(defib.pinCode)}.`);
  } else if (defib.locked) {
    parts.push('The cabinet is locked. The 999 call handler can give you the code.');
  }
  parts.push('If you have not already, call 999 now.');
  return parts.join(' ');
}
