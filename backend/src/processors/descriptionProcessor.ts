import he from "he";

/**
 * Robust description processor refactored from cleanText.ts
 * Decodes HTML entities, removes script/style tags, CSS blocks, formats headings & list items, trims punctuation spacing.
 */
export function processDescription(rawDescription: any): string | null {
  if (!rawDescription) return null;
  const str = String(rawDescription);
  if (!str.trim()) return null;

  // 1. Initial Decode
  let text = he.decode(str);

  // 2. Remove style and script blocks completely
  text = text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // 3. Tag removal and standard newline/paragraph conversions
  let textAfterTags = text
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>?/gm, " ");

  // 4. Decode HTML entities again after tag stripping
  const decoded = he.decode(textAfterTags);

  // 5. Remove CSS-like blocks and fix whitespace
  const cssPattern = /[a-z0-9#.,\s-]+\{[\s\S]*?\}/gi;
  const cleaned = decoded
    .replace(cssPattern, "")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([,.!?;:])/g, "$1") // Remove extraneous spaces before punctuation
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}
