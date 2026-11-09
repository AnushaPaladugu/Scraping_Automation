/**
 * Normalizes date strings (ISO, timestamps, relative dates) to standard ISO string or null.
 */
export function processDate(rawDate: any): string | null {
  if (!rawDate) return null;

  // Handle UNIX timestamp (ms or seconds)
  if (typeof rawDate === "number") {
    const timestamp = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }

  const str = String(rawDate).trim();
  if (!str) return null;

  // Relative dates (e.g. "2 days ago", "Today", "Yesterday")
  const lower = str.toLowerCase();
  if (lower === "today" || lower === "just now") {
    return new Date().toISOString().split("T")[0];
  }
  if (lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  const daysAgoMatch = lower.match(/(\d+)\s+days?\s+ago/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  }

  // Support DD/MM/YYYY and DD-MM-YYYY (e.g. 16/10/2026, 07/10/2026)
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const dNum = parseInt(dmyMatch[1], 10);
    const mNum = parseInt(dmyMatch[2], 10);
    const yNum = parseInt(dmyMatch[3], 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      const d = new Date(Date.UTC(yNum, mNum - 1, dNum));
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
  }

  // Parse standard date string
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    // Format to YYYY-MM-DD in UTC
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      .toISOString()
      .split("T")[0];
  }

  return null;
}
