/** ISO weekday (1 Monday … 7 Sunday) of a YYYY-MM-DD string. */
export function weekdayOfDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
