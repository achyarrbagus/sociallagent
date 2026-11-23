/** Converts a wall-clock "YYYY-MM-DDTHH:mm" in an IANA timezone to a UTC Date. */
export function zonedToUtc(local: string, timeZone: string) {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (at: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(at).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - at;
  };
  // Two passes settle DST edges.
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

export function formatInZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return date.toLocaleString("id-ID", { ...options, timeZone });
}
