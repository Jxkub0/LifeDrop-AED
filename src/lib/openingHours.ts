/**
 * A small, dependency-free engine for the OpenStreetMap `opening_hours` syntax.
 *
 * It covers the forms that defibrillator records actually use in the UK:
 *   24/7 · Mo-Fr 09:00-17:00 · Mo,We,Fr 08:00-12:00,13:00-17:30 · Sa-Mo 10:00-16:00
 *   Mo-Su 22:00-06:00 (overnight) · Su off · PH off · Mo-Fr,PH 10:00-14:00 · 18:00+
 *   rule overrides with ";" and additional rules with ","
 *
 * Anything it does not understand (months, dates, sunrise/sunset, week numbers...)
 * is reported as unsupported so the app can show "hours unknown" instead of guessing.
 */

export const DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MINUTES_PER_DAY = 1440;

/** Minutes since local midnight; `end` may exceed 1440 for spans that run past midnight. */
export interface TimeSpan {
  start: number;
  end: number;
}

export type RuleState = 'open' | 'closed' | 'unknown';

export interface Rule {
  /** Weekday indexes (0 = Monday). null when the rule has no weekday selector. */
  days: number[] | null;
  /** Selector includes PH (public holidays). */
  ph: boolean;
  /** Selector includes SH (school holidays) – cannot be evaluated reliably. */
  sh: boolean;
  spans: TimeSpan[];
  state: RuleState;
  /** Joined to the previous rule with "," (adds hours) rather than ";" (replaces hours). */
  additional: boolean;
}

export type ParsedHours =
  | { ok: true; raw: string; rules: Rule[]; usesPublicHolidays: boolean; alwaysOpen: boolean }
  | { ok: false; raw: string; reason: string };

/* ------------------------------------------------------------------ */
/* Tokeniser                                                           */
/* ------------------------------------------------------------------ */

type Token =
  | { t: 'day'; v: number }
  | { t: 'ph' }
  | { t: 'sh' }
  | { t: 'time'; v: number }
  | { t: 'dash' }
  | { t: 'comma' }
  | { t: 'plus' }
  | { t: 'always' }
  | { t: 'state'; v: RuleState }
  | { t: 'comment' };

const DAY_PATTERNS: [RegExp, number][] = [
  [/^mo(n(day)?)?\b/i, 0],
  [/^tu(e(s(day)?)?)?\b/i, 1],
  [/^we(d(nesday)?)?\b/i, 2],
  [/^th(u(r(s(day)?)?)?)?\b/i, 3],
  [/^fr(i(day)?)?\b/i, 4],
  [/^sa(t(urday)?)?\b/i, 5],
  [/^su(n(day)?)?\b/i, 6],
];

const UNSUPPORTED = /^(sunrise|sunset|dawn|dusk|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|week|easter|\d{4}\b)/i;

class UnsupportedError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let s = input;
  while (s.length > 0) {
    const ws = /^\s+/.exec(s);
    if (ws) {
      s = s.slice(ws[0].length);
      continue;
    }
    if (s.startsWith('"')) {
      const close = s.indexOf('"', 1);
      if (close === -1) throw new UnsupportedError('Unclosed comment');
      tokens.push({ t: 'comment' });
      s = s.slice(close + 1);
      continue;
    }
    if (s.startsWith('24/7')) {
      tokens.push({ t: 'always' });
      s = s.slice(4);
      continue;
    }
    if (UNSUPPORTED.test(s)) throw new UnsupportedError(`Unsupported selector near "${s.slice(0, 12)}"`);

    const time = /^(\d{1,2})[:.](\d{2})/.exec(s);
    if (time) {
      const h = Number(time[1]);
      const m = Number(time[2]);
      if (h > 24 || m > 59 || (h === 24 && m !== 0)) throw new UnsupportedError(`Invalid time ${time[0]}`);
      tokens.push({ t: 'time', v: h * 60 + m });
      s = s.slice(time[0].length);
      continue;
    }
    const kw = /^(off|closed|open|unknown)\b/i.exec(s);
    if (kw) {
      const word = kw[1].toLowerCase();
      tokens.push({ t: 'state', v: word === 'open' ? 'open' : word === 'unknown' ? 'unknown' : 'closed' });
      s = s.slice(kw[0].length);
      continue;
    }
    if (/^ph\b/i.test(s)) {
      tokens.push({ t: 'ph' });
      s = s.slice(2);
      continue;
    }
    if (/^sh\b/i.test(s)) {
      tokens.push({ t: 'sh' });
      s = s.slice(2);
      continue;
    }
    const day = DAY_PATTERNS.find(([re]) => re.test(s));
    if (day) {
      const match = day[0].exec(s)!;
      tokens.push({ t: 'day', v: day[1] });
      s = s.slice(match[0].length);
      continue;
    }
    const ch = s[0];
    if (ch === '-') tokens.push({ t: 'dash' });
    else if (ch === ',') tokens.push({ t: 'comma' });
    else if (ch === '+') tokens.push({ t: 'plus' });
    else if (ch === ':') {
      // "Mo-Fr: 09:00-17:00" – a common hand-typed variant; ignore the colon.
    } else throw new UnsupportedError(`Unexpected "${ch}"`);
    s = s.slice(1);
  }
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

function newRule(additional: boolean): Rule {
  return { days: null, ph: false, sh: false, spans: [], state: 'open', additional };
}

function dayRange(from: number, to: number): number[] {
  const out: number[] = [];
  let d = from;
  for (let i = 0; i < 7; i++) {
    out.push(d);
    if (d === to) break;
    d = (d + 1) % 7;
  }
  return out;
}

function parseRuleTokens(tokens: Token[]): Rule[] {
  const rules: Rule[] = [];
  let rule = newRule(false);
  let hasSelector = false;
  let hasTimes = false;
  let hasStateWord = false;
  let hasComment = false;
  let i = 0;

  const finish = () => {
    if (!hasSelector && !hasTimes && !hasStateWord) {
      if (hasComment) rule.state = 'unknown';
      else return; // empty rule
    }
    if (!hasTimes && rule.state === 'open') rule.spans = [{ start: 0, end: MINUTES_PER_DAY }];
    rules.push(rule);
  };

  const peek = (k = 0) => tokens[i + k];

  while (i < tokens.length) {
    const tok = tokens[i];
    switch (tok.t) {
      case 'always': {
        rule.spans.push({ start: 0, end: MINUTES_PER_DAY });
        hasTimes = true;
        i++;
        break;
      }
      case 'day':
      case 'ph':
      case 'sh': {
        if (hasTimes || hasStateWord) throw new UnsupportedError('Weekday after times');
        hasSelector = true;
        if (tok.t === 'ph') {
          rule.ph = true;
          i++;
        } else if (tok.t === 'sh') {
          rule.sh = true;
          i++;
        } else {
          let days = [tok.v];
          if (peek(1)?.t === 'dash' && peek(2)?.t === 'day') {
            days = dayRange(tok.v, (peek(2) as { v: number }).v);
            i += 3;
          } else {
            i++;
          }
          rule.days = Array.from(new Set([...(rule.days ?? []), ...days])).sort();
        }
        if (peek()?.t === 'comma') i++; // list of selectors
        break;
      }
      case 'time': {
        const start = tok.v;
        let end: number;
        if (peek(1)?.t === 'dash' && peek(2)?.t === 'time') {
          end = (peek(2) as { v: number }).v;
          i += 3;
          if (peek()?.t === 'plus') i++; // "17:00-19:00+" – treat end as given
        } else if (peek(1)?.t === 'plus') {
          end = MINUTES_PER_DAY; // open end: assume until midnight
          i += 2;
        } else {
          throw new UnsupportedError('Time without range');
        }
        if (start >= MINUTES_PER_DAY) throw new UnsupportedError('Start time 24:00');
        if (end <= start) end += MINUTES_PER_DAY; // runs past midnight
        rule.spans.push({ start, end });
        hasTimes = true;
        if (peek()?.t === 'comma') {
          const next = peek(1);
          if (next?.t === 'time') {
            i++; // another span in the same rule
          } else if (next && (next.t === 'day' || next.t === 'ph' || next.t === 'sh')) {
            i++;
            finish();
            rule = newRule(true);
            hasSelector = hasTimes = hasStateWord = hasComment = false;
          } else {
            i++;
          }
        }
        break;
      }
      case 'state': {
        rule.state = tok.v;
        hasStateWord = true;
        if (tok.v !== 'open') rule.spans = [];
        i++;
        break;
      }
      case 'comment': {
        hasComment = true;
        i++;
        break;
      }
      case 'comma': {
        // e.g. "Mo-Fr 09:00-17:00, Sa 10:00-12:00" is handled above; stray commas are tolerated.
        i++;
        break;
      }
      default:
        throw new UnsupportedError(`Unexpected token ${tok.t}`);
    }
  }
  finish();
  return rules;
}

/** Parse an OSM opening_hours value. Never throws. */
export function parseOpeningHours(raw: string | undefined | null): ParsedHours {
  const input = (raw ?? '').trim();
  if (!input) return { ok: false, raw: input, reason: 'No opening hours' };
  if (input.includes('||')) return { ok: false, raw: input, reason: 'Fallback rules (||) not supported' };

  const normalised = input.replace(/[–—−]/g, '-').replace(/\s+/g, ' ');
  try {
    const rules: Rule[] = [];
    for (const part of normalised.split(';')) {
      if (!part.trim()) continue;
      rules.push(...parseRuleTokens(tokenize(part)));
    }
    if (rules.length === 0) return { ok: false, raw: input, reason: 'Nothing to evaluate' };
    const usesPublicHolidays = rules.some((r) => r.ph);
    const alwaysOpen =
      !usesPublicHolidays &&
      !rules.some((r) => r.sh) &&
      [0, 1, 2, 3, 4, 5, 6].every((d) => {
        const s = spansForDay(rules, d, false);
        return !s.uncertain && s.spans.some((x) => x.start <= 0 && x.end >= MINUTES_PER_DAY);
      });
    return { ok: true, raw: input, rules, usesPublicHolidays, alwaysOpen };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Could not parse';
    return { ok: false, raw: input, reason };
  }
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

/** Monday-based weekday index for a JS Date in local time. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Opening spans for one weekday after applying rule precedence.
 * `isHoliday` = null means "not known", which makes PH rules uncertain.
 */
export function spansForDay(
  rules: Rule[],
  weekday: number,
  isHoliday: boolean | null,
): { spans: TimeSpan[]; uncertain: boolean } {
  let spans: TimeSpan[] = [];
  let uncertain = false;

  for (const rule of rules) {
    const weekdayMatch = rule.days === null ? !rule.ph && !rule.sh : rule.days.includes(weekday);
    let matches: boolean | 'maybe' = weekdayMatch;
    if (!weekdayMatch && rule.ph) matches = isHoliday === null ? 'maybe' : isHoliday;
    if (!weekdayMatch && rule.sh && matches !== true) matches = 'maybe';
    if (matches === false) continue;
    if (matches === 'maybe') {
      // Only matters if the rule could change the answer.
      uncertain = true;
      continue;
    }
    if (rule.state === 'unknown') {
      uncertain = true;
      spans = [];
      continue;
    }
    if (rule.additional) {
      spans = rule.state === 'closed' ? [] : [...spans, ...rule.spans];
    } else {
      spans = rule.state === 'closed' ? [] : [...rule.spans];
    }
  }
  return { spans, uncertain };
}

export interface OpenState {
  /** true = open, false = closed, null = cannot tell (holidays/comments/school terms). */
  open: boolean | null;
  /** When the current state ends, if within the next 7 days. */
  changesAt?: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Is the place open at `now`? Uses device-local time.
 * @param holidayLookup returns true/false for a date, or null if unknown.
 */
export function getOpenState(
  parsed: ParsedHours,
  now: Date,
  holidayLookup: (date: Date) => boolean | null = () => false,
): OpenState {
  if (!parsed.ok) return { open: null };
  if (parsed.alwaysOpen) return { open: true };

  const today = startOfDay(now);
  const intervals: { start: Date; end: Date }[] = [];
  let uncertainNow = false;

  // Yesterday (for spans running past midnight) through 7 days ahead.
  for (let offset = -1; offset <= 7; offset++) {
    const day = addDays(today, offset);
    const { spans, uncertain } = spansForDay(parsed.rules, weekdayIndex(day), holidayLookup(day));
    if (uncertain && (offset === 0 || (offset === -1 && spans.some((s) => s.end > MINUTES_PER_DAY)))) {
      uncertainNow = true;
    }
    for (const span of spans) {
      intervals.push({
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, span.start),
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, span.end),
      });
    }
  }
  if (uncertainNow) return { open: null };

  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      if (iv.end.getTime() > last.end.getTime()) last.end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }

  const t = now.getTime();
  const horizon = addDays(today, 7).getTime();
  const current = merged.find((iv) => iv.start.getTime() <= t && t < iv.end.getTime());
  if (current) {
    return { open: true, changesAt: current.end.getTime() < horizon ? current.end : undefined };
  }
  const next = merged.find((iv) => iv.start.getTime() > t);
  return { open: false, changesAt: next && next.start.getTime() < horizon + MINUTES_PER_DAY * 60_000 ? next.start : undefined };
}

/* ------------------------------------------------------------------ */
/* Formatting & building                                               */
/* ------------------------------------------------------------------ */

export function formatMinutes(mins: number): string {
  const m = ((mins % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mins === MINUTES_PER_DAY) return '24:00';
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Weekly timetable for display (ignores public holidays). */
export function describeWeek(parsed: ParsedHours): { day: string; text: string }[] | null {
  if (!parsed.ok) return null;
  return DAY_NAMES.map((name, d) => {
    const { spans, uncertain } = spansForDay(parsed.rules, d, false);
    let text: string;
    if (spans.some((s) => s.start === 0 && s.end >= MINUTES_PER_DAY)) text = 'Open 24 hours';
    else if (spans.length === 0) text = uncertain ? 'Varies' : 'Closed';
    else text = spans.map((s) => `${formatMinutes(s.start)}–${formatMinutes(s.end)}`).join(', ');
    return { day: name, text };
  });
}

/** Human-friendly time for "closes at"/"opens at" messages relative to now. */
export function describeChange(changesAt: Date, now: Date): string {
  const time = formatMinutes(changesAt.getHours() * 60 + changesAt.getMinutes());
  const dayDiff = Math.round((startOfDay(changesAt).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `${time} tomorrow`;
  return `${DAY_SHORT[weekdayIndex(changesAt)]} ${time}`;
}

export interface DaySchedule {
  open: boolean;
  /** minutes from midnight */
  start: number;
  /** minutes from midnight; may be <= start for overnight */
  end: number;
}

/**
 * Turn a 7-day schedule (Monday first) from the "Add defibrillator" form into
 * a compact OSM opening_hours string, e.g. "Mo-Fr 09:00-17:00; Sa 10:00-14:00".
 */
export function buildOpeningHours(week: DaySchedule[]): string {
  if (week.length !== 7) throw new Error('Expected 7 days');
  const isAllDay = (d: DaySchedule) => d.open && d.start === 0 && (d.end === MINUTES_PER_DAY || d.end === 0);
  if (week.every(isAllDay)) return '24/7';
  if (week.every((d) => !d.open)) return 'off';

  const key = (d: DaySchedule) =>
    d.open ? (isAllDay(d) ? '00:00-24:00' : `${formatMinutes(d.start)}-${d.end === MINUTES_PER_DAY ? '24:00' : formatMinutes(d.end)}`) : '';

  const groups: { from: number; to: number; times: string }[] = [];
  week.forEach((d, i) => {
    const times = key(d);
    const last = groups[groups.length - 1];
    if (last && last.times === times && last.to === i - 1) last.to = i;
    else groups.push({ from: i, to: i, times });
  });

  return groups
    .filter((g) => g.times)
    .map((g) => {
      const days = g.from === g.to ? DAY_KEYS[g.from] : g.to - g.from === 1 ? `${DAY_KEYS[g.from]},${DAY_KEYS[g.to]}` : `${DAY_KEYS[g.from]}-${DAY_KEYS[g.to]}`;
      return `${days} ${g.times}`;
    })
    .join('; ');
}
