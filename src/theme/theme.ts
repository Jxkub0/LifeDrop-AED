import type { AvailabilityStatus } from '../lib/types';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  /** Emergency actions (Find nearest, Call 999). */
  emergency: string;
  onEmergency: string;
  /** Normal actions. */
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  focus: string;
  banner: string;
  onBanner: string;
  status: Record<AvailabilityStatus, { bg: string; fg: string; border: string }>;
}

export interface Theme {
  easy: boolean;
  highContrast: boolean;
  /** Dark interface (follows the phone or the user's choice). */
  dark: boolean;
  colors: Palette;
  font: { small: number; body: number; large: number; title: number; huge: number };
  /** Minimum height of any touch target. */
  touch: number;
  /** Size of map markers. */
  marker: number;
  borderWidth: number;
  radius: number;
  space: (n: number) => number;
}

// GOV.UK-inspired palette: tested for WCAG AA contrast with white/black text.
const standardPalette: Palette = {
  background: '#FFFFFF',
  surface: '#F3F2F1',
  surfaceAlt: '#E8F1F8',
  text: '#0B0C0C',
  textMuted: '#484949',
  border: '#B1B4B6',
  emergency: '#C3002F',
  onEmergency: '#FFFFFF',
  primary: '#1D70B8',
  onPrimary: '#FFFFFF',
  secondary: '#F3F2F1',
  onSecondary: '#0B0C0C',
  focus: '#FFDD00',
  banner: '#0B0C0C',
  onBanner: '#FFFFFF',
  status: {
    available: { bg: '#00703C', fg: '#FFFFFF', border: '#FFFFFF' },
    closed: { bg: '#B10E1E', fg: '#FFFFFF', border: '#FFFFFF' },
    restricted: { bg: '#505A5F', fg: '#FFFFFF', border: '#FFFFFF' },
    unknown: { bg: '#FFDD00', fg: '#0B0C0C', border: '#0B0C0C' },
  },
};

// Dark interface – softer than high contrast, for night-time use.
const darkPalette: Palette = {
  background: '#111315',
  surface: '#1E2125',
  surfaceAlt: '#1B2A3A',
  text: '#ECEEF0',
  textMuted: '#B4BAC1',
  border: '#454B52',
  emergency: '#D4213D',
  onEmergency: '#FFFFFF',
  primary: '#8AB4F8',
  onPrimary: '#0B1A2E',
  secondary: '#2A2E33',
  onSecondary: '#ECEEF0',
  focus: '#FFDD00',
  banner: '#B3001E',
  onBanner: '#FFFFFF',
  status: {
    available: { bg: '#00873F', fg: '#FFFFFF', border: '#FFFFFF' },
    closed: { bg: '#C4162A', fg: '#FFFFFF', border: '#FFFFFF' },
    restricted: { bg: '#6B757B', fg: '#FFFFFF', border: '#FFFFFF' },
    unknown: { bg: '#FFDD00', fg: '#0B0C0C', border: '#0B0C0C' },
  },
};

// Maximum contrast: pure black background, white text, yellow actions.
const highContrastPalette: Palette = {
  background: '#000000',
  surface: '#121212',
  surfaceAlt: '#1E1E1E',
  text: '#FFFFFF',
  textMuted: '#F0F0F0',
  border: '#FFFFFF',
  emergency: '#FFDD00',
  onEmergency: '#000000',
  primary: '#FFFFFF',
  onPrimary: '#000000',
  secondary: '#000000',
  onSecondary: '#FFFFFF',
  focus: '#00FFFF',
  banner: '#FFDD00',
  onBanner: '#000000',
  status: {
    available: { bg: '#00E05A', fg: '#000000', border: '#FFFFFF' },
    closed: { bg: '#FF5C5C', fg: '#000000', border: '#FFFFFF' },
    restricted: { bg: '#C8C8C8', fg: '#000000', border: '#FFFFFF' },
    unknown: { bg: '#FFDD00', fg: '#000000', border: '#FFFFFF' },
  },
};

export type TextSize = 'normal' | 'large' | 'xlarge';

const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.15, xlarge: 1.3 };

export function makeTheme(opts: {
  easy: boolean;
  highContrast: boolean;
  dark?: boolean;
  textSize?: TextSize;
  largeMarkers?: boolean;
}): Theme {
  const { easy, highContrast } = opts;
  const dark = !highContrast && !!opts.dark;
  const k = TEXT_SCALE[opts.textSize ?? 'normal'];
  // Easy mode: body text 22pt, never below 20pt.
  const base = easy
    ? { small: 20, body: 22, large: 26, title: 30, huge: 36 }
    : { small: 14, body: 16, large: 19, title: 24, huge: 30 };
  const scale = (n: number) => Math.round(n * k);
  return {
    easy,
    highContrast,
    dark,
    colors: highContrast ? highContrastPalette : dark ? darkPalette : standardPalette,
    font: {
      small: scale(base.small),
      body: scale(base.body),
      large: scale(base.large),
      title: scale(base.title),
      huge: scale(base.huge),
    },
    touch: easy ? 64 : 48,
    marker: easy || opts.largeMarkers ? 44 : 32,
    borderWidth: highContrast ? 3 : easy ? 2 : 1,
    radius: easy ? 14 : 10,
    space: (n: number) => n * (easy ? 6 : 4),
  };
}
