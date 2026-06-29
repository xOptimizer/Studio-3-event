/** Canonical event display copy — keep in sync with Studio-3-teaser/src/constants/event.js */
export const EVENT_DISPLAY = {
  title: 'Inside the Mind of an Artist',
  venue: 'Dec on Dragon',
  address: '1414 Dragon St, Dallas, TX 75207',
  dateLabel: 'Saturday, July 25, 2026',
  timeLabel: '8:00 PM – 12:00 AM CDT',
  dateTimeLabel: 'Saturday, July 25, 2026 · 8:00 PM – 12:00 AM CDT',
  /** 8:00 PM CDT on July 25, 2026 */
  startsAt: new Date('2026-07-26T01:00:00.000Z'),
  /** 12:00 AM CDT on July 26, 2026 (midnight end) */
  endsAt: new Date('2026-07-26T05:00:00.000Z'),
};

export function getEventDateTimeLabel() {
  return EVENT_DISPLAY.dateTimeLabel;
}
