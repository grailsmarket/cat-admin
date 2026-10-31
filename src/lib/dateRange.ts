const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse the `to` query param as an exclusive upper bound.
 * A date-only value (YYYY-MM-DD) means "through the end of that UTC day",
 * so it becomes midnight of the following day.
 */
export function parseRangeEnd(toParam: string): Date {
  const date = new Date(toParam)
  if (DATE_ONLY.test(toParam) && !isNaN(date.getTime())) {
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return date
}
