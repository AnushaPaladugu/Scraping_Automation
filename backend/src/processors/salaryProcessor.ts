export function processSalary(rawSalary: any): string | null {
  if (!rawSalary) return null;

  // 1. Handle JSON-LD baseSalary object
  if (typeof rawSalary === "object") {
    const currency = rawSalary.currency || "$";
    const value = rawSalary.value;

    if (value && typeof value === "object") {
      const min = value.minValue;
      const max = value.maxValue;
      const unit = value.unitText ? ` / ${value.unitText.toLowerCase()}` : "";
      if (min && max) {
        return `${currency}${Number(min).toLocaleString("en-US")} - ${currency}${Number(max).toLocaleString("en-US")}${unit}`;
      } else if (value.value) {
        return `${currency}${Number(value.value).toLocaleString("en-US")}${unit}`;
      }
    } else if (typeof value === "number" || typeof value === "string") {
      const num = Number(String(value).replace(/[^0-9.]/g, ""));
      return isNaN(num) ? `${currency}${value}` : `${currency}${num.toLocaleString("en-US")}`;
    }
  }

  // 2. Handle String
  if (typeof rawSalary !== "string") return null;
  const text = rawSalary.trim();
  if (!text) return null;

  // Detect currency symbol or code
  const currencyMatch = text.match(/([£$€¥₹]|CAD|USD|GBP|EUR|INR)/i);
  const currency = currencyMatch ? currencyMatch[1].toUpperCase() : "";

  const isHourly = /\b(?:hour|hourly|hr|\/hr)\b/i.test(text);

  // Pattern 1: Currency / number range e.g. "£30,809 - £37,505" or "£30809 - £37505" or "$80,000 to $120,000"
  const rangeRegex = /(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)?\s*(\d{1,3}(?:,\d{3})+|\d{4,7})\s*(?:-|–|—|to)\s*(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)?\s*(\d{1,3}(?:,\d{3})+|\d{4,7})/i;
  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const minNum = Number(rangeMatch[1].replace(/,/g, ""));
    const maxNum = Number(rangeMatch[2].replace(/,/g, ""));
    const symbol = currency || "£";
    const unit = isHourly ? " / hour" : "";
    return `${symbol}${minNum.toLocaleString("en-US")} - ${symbol}${maxNum.toLocaleString("en-US")}${unit}`;
  }

  // Pattern 2: Decimal range for hourly rates e.g. "$12.50 - $18.00 / hour"
  const decRangeRegex = /(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)?\s*(\d{1,3}\.\d{2})\s*(?:-|–|—|to)\s*(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)?\s*(\d{1,3}\.\d{2})/i;
  const decRangeMatch = text.match(decRangeRegex);
  if (decRangeMatch) {
    const symbol = currency || "£";
    return `${symbol}${decRangeMatch[1]} - ${symbol}${decRangeMatch[2]} / hour`;
  }

  // Pattern 3: Single annual amount with noisy text e.g. "£24,853 (pro rata), 30% evening and 45% weekend enhancements"
  // or "DHU Band 2, £24,853 per annum (pro rata)" or "Band 8b.0 - £64,234"
  const singleRegex = /(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)\s*(\d{1,3}(?:,\d{3})+|\d{4,7})/i;
  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const num = Number(singleMatch[1].replace(/,/g, ""));
    const symbol = currency || "£";
    return `${symbol}${num.toLocaleString("en-US")}`;
  }

  // Pattern 4: Single hourly amount e.g. "£12.71 per hour + 30% evening and 45% weekend enhancement"
  const singleHourlyRegex = /(?:[£$€¥₹]|CAD|USD|GBP|EUR|INR)\s*(\d{1,3}\.\d{2})/i;
  const singleHourlyMatch = text.match(singleHourlyRegex);
  if (singleHourlyMatch) {
    const symbol = currency || "£";
    return `${symbol}${singleHourlyMatch[1]} / hour`;
  }

  // Pattern 5: Plain number range like "30809 - 37505"
  const plainRange = text.match(/^(\d{4,7})\s*(?:-|–|to)\s*(\d{4,7})$/);
  if (plainRange) {
    const minNum = Number(plainRange[1]);
    const maxNum = Number(plainRange[2]);
    return `${minNum.toLocaleString("en-US")} - ${maxNum.toLocaleString("en-US")}`;
  }

  // Pattern 6: Plain number like "47440" or "30,809"
  const plainSingle = text.match(/^\b(\d{1,3}(?:,\d{3})+|\d{4,7})\b$/);
  if (plainSingle) {
    const num = Number(plainSingle[1].replace(/,/g, ""));
    return num.toLocaleString("en-US");
  }

  return null;
}
