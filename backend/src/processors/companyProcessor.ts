/**
 * Preserves the exact company name from the user input as requested.
 * Does not strip legal suffixes (Ltd, Inc, PLC, etc.).
 * Only falls back to extracting from URL if the company name was not provided.
 */
export function processCompany(rawCompany: any, urlContext?: string): string {
  if (rawCompany !== undefined && rawCompany !== null) {
    const trimmed = String(rawCompany).trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  // Fallback to domain-derived name only if company was completely missing
  if (urlContext) {
    try {
      const hostname = new URL(urlContext).hostname;
      const parts = hostname
        .split(".")
        .filter((p) => !["www", "com", "jobs", "careers", "org", "co", "io", "net", "wd5", "myworkdayjobs"].includes(p));
      if (parts.length > 0) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
    } catch {
      // fallback
    }
  }

  return "Unknown Company";
}
