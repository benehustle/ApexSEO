/**
 * Scheduling utilities — Mon/Wed/Fri at 02:00 UTC publishing schedule.
 *
 * All sites post exactly 3 times per week: Monday, Wednesday, Friday at 2 AM UTC.
 * No site can post more than once per day.
 */

/**
 * Returns the next Monday, Wednesday, or Friday at 02:00 UTC
 * that is strictly AFTER the given `after` date.
 */
export function getNextMWFDate(after: Date = new Date()): Date {
  const candidate = new Date(after);
  // Always start from the next day at 02:00 UTC
  candidate.setUTCDate(candidate.getUTCDate() + 1);
  candidate.setUTCHours(2, 0, 0, 0);

  // Advance until we land on Mon (1), Wed (3), or Fri (5)
  let safety = 0;
  while (safety < 10) {
    const day = candidate.getUTCDay();
    if (day === 1 || day === 3 || day === 5) {
      return new Date(candidate);
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(2, 0, 0, 0);
    safety++;
  }

  return new Date(candidate); // fallback (should never reach here)
}

/**
 * Returns the next `count` Mon/Wed/Fri dates at 02:00 UTC,
 * each strictly after the previous.
 *
 * @param count  - How many dates to return
 * @param startAfter - Start generating from after this date (defaults to now)
 */
export function getNextMWFDates(count: number, startAfter: Date = new Date()): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(startAfter);
  for (let i = 0; i < count; i++) {
    cursor = getNextMWFDate(cursor);
    dates.push(new Date(cursor));
  }
  return dates;
}

/**
 * Returns the nearest upcoming Mon/Wed/Fri at 02:00 UTC.
 * If today IS a Mon/Wed/Fri and it's before 02:00 UTC, returns today at 02:00 UTC.
 * Otherwise returns the next MWF day.
 */
export function getCurrentOrNextMWFDate(): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(2, 0, 0, 0);

  // If today is MWF and 2 AM hasn't passed yet, use today
  const day = candidate.getUTCDay();
  if ((day === 1 || day === 3 || day === 5) && candidate > now) {
    return candidate;
  }

  // Otherwise find the next MWF
  return getNextMWFDate(now);
}
