import he from "he";

export interface ExtractedTitleResult {
  title: string;
  ref: string | null;
}

export function extractTitleAndRef(rawTitle: any): ExtractedTitleResult {
  if (!rawTitle) return { title: "", ref: null };
  let title = String(rawTitle).trim();

  // Decode HTML entities
  title = he.decode(title);

  // Remove HTML tags if any were in title
  title = title.replace(/<[^>]*>/g, " ");

  // Remove common noisy tags in job titles like (m/w/d), (f/m/d), [Remote]
  title = title
    .replace(/\s*\((?:m\/w\/d|f\/m\/d|w\/m\/d|m\/f\/d)\)/gi, "")
    .replace(/\s*\[(?:remote|hybrid|onsite|flexible)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  let extractedRef: string | null = null;

  // 1. Explicit Requisition / Ref ID in title (e.g. "Senior Dev - req: 12345" or "Ref: 2161-R - Lecturer")
  const explicitRefMatch = title.match(/(?:^|\s*[-|–]\s*)(?:req(?:uisition)?|job|vacancy)?\s*(?:id|ref(?:erence)?|#)\s*[:#]?\s*([a-z0-9/-]+)/i);
  if (explicitRefMatch && explicitRefMatch[1] && /\d/.test(explicitRefMatch[1])) {
    extractedRef = explicitRefMatch[1].trim();
    title = title.replace(explicitRefMatch[0], " ").trim();
  }

  // 2. Trailing reference code in parentheses, e.g. "Business Development Manager (VA462)"
  if (!extractedRef) {
    const trailingParenMatch = title.match(/^(.*?)\s*\(\s*(?:ref[:\s#]*)?([A-Z0-9]{2,10}(?:[/-][A-Z0-9]{1,10})?)\s*\)\s*$/i);
    if (trailingParenMatch) {
      const candidateCode = trailingParenMatch[2].trim();
      // Must contain at least one digit or explicit ref format, and not be common words like (Full Time) or (London)
      if (/\d/.test(candidateCode) && candidateCode.length >= 2) {
        extractedRef = candidateCode;
        title = trailingParenMatch[1].trim();
      }
    }
  }

  // 3. Leading reference code separated by hyphen/colon, e.g. "2203 - Lecturer - Health..." or "2161-R - Lecturer..."
  if (!extractedRef) {
    const leadingCodeMatch = title.match(/^\s*(?:ref[:\s#]*)?([A-Z0-9]{2,10}(?:[/-][A-Z0-9]{1,10})?)\s*[-–:]\s+(.+)$/i);
    if (leadingCodeMatch) {
      const candidateCode = leadingCodeMatch[1].trim();
      const restTitle = leadingCodeMatch[2].trim();
      if (/\d/.test(candidateCode) && restTitle.length >= 3) {
        extractedRef = candidateCode;
        title = restTitle;
      }
    }
  }

  // 4. Duplicate organization prefix: e.g. "UNISON Manchester | UNISON Manchester Branch-Employed Organiser"
  const orgDupMatch = title.match(/^([^|–-]+)\s*\|\s*\1(?:\s+Branch)?\s*[-–:]\s*(.+)$/i);
  if (orgDupMatch && orgDupMatch[2]) {
    title = orgDupMatch[2].trim();
  }

  // Final cleanup of hyphens or colons left dangling at edges
  title = title
    .replace(/^[-–:|/\s]+/, "")
    .replace(/[-–:|/\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    ref: extractedRef,
  };
}

export function processTitle(rawTitle: any): string {
  return extractTitleAndRef(rawTitle).title;
}
