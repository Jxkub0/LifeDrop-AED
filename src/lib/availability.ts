import { describeChange, getOpenState, parseOpeningHours, type ParsedHours } from './openingHours';
import type { Availability, Defibrillator } from './types';

/** OSM access values that mean "not for the public". */
const RESTRICTED_ACCESS = new Set(['no', 'private', 'permit', 'delivery', 'agricultural', 'forestry', 'military']);

const parseCache = new Map<string, ParsedHours>();

function parseCached(raw: string): ParsedHours {
  let parsed = parseCache.get(raw);
  if (!parsed) {
    parsed = parseOpeningHours(raw);
    if (parseCache.size > 2000) parseCache.clear();
    parseCache.set(raw, parsed);
  }
  return parsed;
}

/**
 * Decide whether a defibrillator can be used right now, from its access tag,
 * opening hours and whether it is indoors. Uses the device's local time.
 */
export function evaluateAvailability(
  defib: Pick<Defibrillator, 'access' | 'openingHours' | 'indoor'>,
  now: Date,
  holidayLookup: (d: Date) => boolean | null,
): Availability {
  const access = defib.access?.trim().toLowerCase();
  if (access && RESTRICTED_ACCESS.has(access)) {
    return {
      status: 'restricted',
      label: 'Restricted access',
      detail: 'Private – not for public use',
      assumed: false,
    };
  }

  const hours = defib.openingHours?.trim();
  if (hours) {
    const parsed = parseCached(hours);
    if (!parsed.ok) {
      return {
        status: 'unknown',
        label: 'Hours unclear',
        detail: `Listed hours: ${hours}`,
        assumed: false,
      };
    }
    if (parsed.alwaysOpen) {
      return { status: 'available', label: 'Available now', detail: 'Open 24 hours, every day', assumed: false };
    }
    const state = getOpenState(parsed, now, holidayLookup);
    if (state.open === null) {
      return {
        status: 'unknown',
        label: 'Hours unclear',
        detail: `Listed hours: ${hours}`,
        assumed: false,
      };
    }
    if (state.open) {
      return {
        status: 'available',
        label: 'Available now',
        detail: state.changesAt ? `Open until ${describeChange(state.changesAt, now)}` : 'Open now',
        assumed: false,
        changesAt: state.changesAt,
      };
    }
    return {
      status: 'closed',
      label: 'Closed now',
      detail: state.changesAt ? `Opens ${describeChange(state.changesAt, now)}` : 'Closed',
      assumed: false,
      changesAt: state.changesAt,
    };
  }

  // No opening hours recorded.
  if (defib.indoor === false) {
    return {
      status: 'available',
      label: 'Available now',
      detail: 'Outdoor cabinet – usually available 24/7',
      assumed: true,
    };
  }
  return {
    status: 'unknown',
    label: 'Hours not listed',
    detail: defib.indoor ? 'Inside a building – may be locked when closed' : 'Opening hours not recorded',
    assumed: false,
  };
}
