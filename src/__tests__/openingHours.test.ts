import {
  buildOpeningHours,
  describeWeek,
  getOpenState,
  parseOpeningHours,
  type DaySchedule,
} from '../lib/openingHours';

// 2026-11-16 is a Monday. Months are 0-based in JS Dates.
const mon = (h: number, m = 0) => new Date(2026, 10, 16, h, m);
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 16 + dayOffset, h, m);
const noHolidays = () => false;

function isOpen(hours: string, when: Date, holiday: (d: Date) => boolean | null = noHolidays) {
  return getOpenState(parseOpeningHours(hours), when, holiday).open;
}

describe('parseOpeningHours', () => {
  it('treats 24/7 as always open', () => {
    const p = parseOpeningHours('24/7');
    expect(p.ok && p.alwaysOpen).toBe(true);
    expect(isOpen('24/7', at(6, 3))).toBe(true);
  });

  it('treats Mo-Su 00:00-24:00 as always open', () => {
    const p = parseOpeningHours('Mo-Su 00:00-24:00');
    expect(p.ok && p.alwaysOpen).toBe(true);
  });

  it('rejects empty and unsupported values', () => {
    expect(parseOpeningHours('').ok).toBe(false);
    expect(parseOpeningHours(undefined).ok).toBe(false);
    expect(parseOpeningHours('sunrise-sunset').ok).toBe(false);
    expect(parseOpeningHours('Jan-Mar Mo-Fr 09:00-17:00').ok).toBe(false);
    expect(parseOpeningHours('9am-5pm').ok).toBe(false);
    expect(parseOpeningHours('Mo-Fr 09:00-17:00 || "by appointment"').ok).toBe(false);
  });
});

describe('getOpenState – weekday ranges', () => {
  const hours = 'Mo-Fr 09:00-17:00';
  it('is open during the day on weekdays', () => {
    expect(isOpen(hours, mon(9, 0))).toBe(true);
    expect(isOpen(hours, mon(16, 59))).toBe(true);
  });
  it('is closed outside the hours and at the weekend', () => {
    expect(isOpen(hours, mon(8, 59))).toBe(false);
    expect(isOpen(hours, mon(17, 0))).toBe(false);
    expect(isOpen(hours, at(5, 12))).toBe(false); // Saturday
  });
  it('reports when it closes and opens', () => {
    const open = getOpenState(parseOpeningHours(hours), mon(10), noHolidays);
    expect(open.changesAt).toEqual(mon(17));
    const fridayEvening = getOpenState(parseOpeningHours(hours), at(4, 18), noHolidays);
    expect(fridayEvening.open).toBe(false);
    expect(fridayEvening.changesAt).toEqual(at(7, 9)); // next Monday 09:00
  });
});

describe('getOpenState – multiple rules', () => {
  it('handles several rules separated by semicolons', () => {
    const h = 'Mo-Fr 07:00-22:00; Sa-Su 09:00-19:00';
    expect(isOpen(h, at(5, 8))).toBe(false);
    expect(isOpen(h, at(5, 9))).toBe(true);
    expect(isOpen(h, at(6, 20))).toBe(false);
    expect(isOpen(h, mon(21, 30))).toBe(true);
  });

  it('lets later rules override earlier ones for the same day', () => {
    const h = 'Mo-Su 08:00-20:00; Su 10:00-16:00';
    expect(isOpen(h, at(6, 9))).toBe(false);
    expect(isOpen(h, at(6, 11))).toBe(true);
    expect(isOpen(h, at(5, 9))).toBe(true);
  });

  it('supports day lists and split times', () => {
    const h = 'Mo,We,Fr 08:00-12:00,13:00-17:30';
    expect(isOpen(h, mon(12, 30))).toBe(false);
    expect(isOpen(h, mon(13, 0))).toBe(true);
    expect(isOpen(h, at(1, 10))).toBe(false); // Tuesday
    expect(isOpen(h, at(2, 17, 15))).toBe(true); // Wednesday
  });

  it('supports additional rules joined with a comma', () => {
    const h = 'Mo-Fr 08:00-12:00, We 14:00-18:00';
    expect(isOpen(h, at(2, 15))).toBe(true);
    expect(isOpen(h, at(2, 10))).toBe(true);
    expect(isOpen(h, at(1, 15))).toBe(false);
  });

  it('understands "off" and "closed"', () => {
    const h = 'Mo-Sa 09:00-17:00; Su off';
    expect(isOpen(h, at(6, 12))).toBe(false);
    expect(isOpen('Mo-Fr 09:00-17:00; Sa,Su closed', at(5, 12))).toBe(false);
  });

  it('treats a weekday without times as open all day', () => {
    expect(isOpen('Mo-Fr', mon(2))).toBe(true);
    expect(isOpen('Mo-Fr', at(5, 2))).toBe(false);
  });

  it('wraps weekday ranges past Sunday', () => {
    const h = 'Fr-Mo 10:00-16:00';
    expect(isOpen(h, at(6, 12))).toBe(true); // Sunday
    expect(isOpen(h, mon(12))).toBe(true);
    expect(isOpen(h, at(1, 12))).toBe(false); // Tuesday
  });
});

describe('getOpenState – overnight and open-ended', () => {
  it('handles spans that run past midnight', () => {
    const h = 'Mo-Su 22:00-06:00';
    expect(isOpen(h, mon(23))).toBe(true);
    expect(isOpen(h, at(1, 5, 59))).toBe(true);
    expect(isOpen(h, at(1, 6))).toBe(false);
    expect(isOpen(h, mon(12))).toBe(false);
  });

  it('carries Friday night into Saturday morning only', () => {
    const h = 'Fr 20:00-02:00';
    expect(isOpen(h, at(5, 1))).toBe(true);
    expect(isOpen(h, at(6, 1))).toBe(false);
  });

  it('treats "18:00+" as open until midnight', () => {
    expect(isOpen('Mo-Fr 18:00+', mon(23))).toBe(true);
  });
});

describe('getOpenState – public and school holidays', () => {
  const bankHolidayMonday = (d: Date) => d.getFullYear() === 2026 && d.getMonth() === 10 && d.getDate() === 16;

  it('applies "PH off" on bank holidays', () => {
    const h = 'Mo-Fr 09:00-17:00; PH off';
    expect(isOpen(h, mon(12), bankHolidayMonday)).toBe(false);
    expect(isOpen(h, at(1, 12), bankHolidayMonday)).toBe(true);
  });

  it('keeps normal hours on a bank holiday when PH is not mentioned', () => {
    expect(isOpen('Mo-Fr 09:00-17:00', mon(12), bankHolidayMonday)).toBe(true);
  });

  it('supports PH in a day list', () => {
    const h = 'Sa,PH 10:00-14:00';
    expect(isOpen(h, mon(12), bankHolidayMonday)).toBe(true);
    expect(isOpen(h, at(1, 12), bankHolidayMonday)).toBe(false);
  });

  it('returns null when holiday data is unknown and a PH rule exists', () => {
    expect(isOpen('Mo-Fr 09:00-17:00; PH off', mon(12), () => null)).toBeNull();
  });

  it('returns null for school-holiday rules it cannot evaluate', () => {
    expect(isOpen('Mo-Fr 08:00-16:00; SH off', mon(12))).toBeNull();
  });

  it('returns null for comment-only rules', () => {
    expect(isOpen('"ask at reception"', mon(12))).toBeNull();
  });
});

describe('lenient input', () => {
  it('accepts long day names, en dashes and a colon after the days', () => {
    expect(isOpen('Mon–Fri: 9:00–17:00', mon(10))).toBe(true);
    expect(isOpen('Monday-Friday 09.00-17.00', at(5, 10))).toBe(false);
  });
});

describe('describeWeek', () => {
  it('produces a readable timetable', () => {
    const week = describeWeek(parseOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00'))!;
    expect(week[0]).toEqual({ day: 'Monday', text: '09:00–17:00' });
    expect(week[5]).toEqual({ day: 'Saturday', text: '10:00–14:00' });
    expect(week[6]).toEqual({ day: 'Sunday', text: 'Closed' });
    expect(describeWeek(parseOpeningHours('24/7'))![3].text).toBe('Open 24 hours');
  });
});

describe('buildOpeningHours', () => {
  const day = (open: boolean, start = 540, end = 1020): DaySchedule => ({ open, start, end });

  it('builds 24/7', () => {
    expect(buildOpeningHours(new Array(7).fill(day(true, 0, 1440)))).toBe('24/7');
  });

  it('groups consecutive days with the same hours', () => {
    const week = [day(true), day(true), day(true), day(true), day(true), day(true, 600, 840), day(false)];
    const out = buildOpeningHours(week);
    expect(out).toBe('Mo-Fr 09:00-17:00; Sa 10:00-14:00');
    // Round trip through the parser.
    expect(isOpen(out, mon(10))).toBe(true);
    expect(isOpen(out, at(5, 13))).toBe(true);
    expect(isOpen(out, at(6, 12))).toBe(false);
  });

  it('writes pairs of days as a list and keeps overnight spans', () => {
    const week = [day(false), day(false), day(false), day(false), day(false), day(true, 1320, 120), day(true, 1320, 120)];
    const out = buildOpeningHours(week);
    expect(out).toBe('Sa,Su 22:00-02:00');
    expect(isOpen(out, at(6, 1))).toBe(true); // Sunday 01:00 (from Saturday night)
    expect(isOpen(out, at(7, 1))).toBe(true); // Monday 01:00 (from Sunday night)
  });

  it('handles fully closed weeks', () => {
    expect(buildOpeningHours(new Array(7).fill(day(false)))).toBe('off');
    expect(isOpen('off', mon(12))).toBe(false);
  });
});
