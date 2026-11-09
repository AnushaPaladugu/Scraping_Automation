import { RemoteType } from "../types/job";
import { toCanonicalCountry } from "../utils/countryMatcher";

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia"
};

const UK_POSTCODE_REGEX = /\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/i;

const UK_REGIONS = new Set([
  "london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool",
  "bristol", "sheffield", "newcastle", "nottingham", "cardiff", "belfast", "southampton",
  "oxford", "cambridge", "uxbridge", "watford", "hertfordshire", "northampton", "ipswich",
  "colchester", "aylesbury", "surrey", "essex", "kent", "yorkshire", "lancashire",
  "middlesex", "berkshire", "oxfordshire", "cambridgeshire", "somerset", "dorset",
  "devon", "cornwall", "gloucestershire", "warwickshire", "northamptonshire", "suffolk",
  "norfolk", "hampshire", "sussex", "wiltshire", "cheshire", "derbyshire", "nottinghamshire",
  "leicestershire", "staffordshire", "lincolnshire", "cumbria", "durham", "northumberland",
  "aberdeen", "dundee", "swansea", "reading", "milton keynes", "luton", "swindon"
]);

const INDIA_CITIES = new Set([
  "bangalore", "bengaluru", "hyderabad", "pune", "mumbai", "chennai", "noida",
  "gurgaon", "gurugram", "delhi", "new delhi", "kolkata", "ahmedabad", "jaipur",
  "kochi", "coimbatore", "chandigarh", "indore"
]);

export interface ProcessedLocation {
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  remote_type: RemoteType;
}

export function processLocation(
  rawLocation: any,
  titleContext: string = "",
  descriptionContext: string = "",
  defaultCountry?: string | null
): ProcessedLocation {
  let locationStr = "";
  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;
  let remoteType: RemoteType = null;

  // Handle object structure from JSON-LD or API (e.g. { address: { ... } } or { city, state, country })
  if (rawLocation && typeof rawLocation === "object") {
    if (rawLocation.address) {
      const addr = rawLocation.address;
      city = addr.addressLocality || null;
      const reg = (addr.addressRegion || "").trim();
      state = (reg.length === 2 && US_STATES[reg.toUpperCase()]) ? US_STATES[reg.toUpperCase()] : (reg || null);
      country = addr.addressCountry || null;
    } else {
      city = rawLocation.city || rawLocation.locality || null;
      const reg = (rawLocation.state || rawLocation.region || "").trim();
      state = (reg.length === 2 && US_STATES[reg.toUpperCase()]) ? US_STATES[reg.toUpperCase()] : (reg || null);
      country = rawLocation.country || rawLocation.countryCode || null;
    }

    if (rawLocation.name && typeof rawLocation.name === "string") {
      locationStr = rawLocation.name;
    } else if (rawLocation.location && typeof rawLocation.location === "string") {
      locationStr = rawLocation.location;
    }
  } else if (typeof rawLocation === "string") {
    locationStr = rawLocation.trim();
  }

  // Detect remote_type from location, title, or workplaceType
  const fullContext = `${locationStr} ${titleContext} ${descriptionContext.slice(0, 500)}`.toLowerCase();
  if (fullContext.includes("hybrid")) {
    remoteType = "Hybrid";
  } else if (
    fullContext.includes("remote") ||
    fullContext.includes("virtual") ||
    fullContext.includes("work from home") ||
    fullContext.includes("wfh")
  ) {
    remoteType = "Remote";
  } else if (fullContext.includes("onsite") || fullContext.includes("on-site") || fullContext.includes("in-office")) {
    remoteType = "Onsite";
  }

  // If city/state/country not yet extracted from object, parse from string
  if (locationStr && (!city || !state || !country)) {
    const parts = locationStr.split(",").map((p) => p.trim()).filter(Boolean);

    if (parts.length === 1) {
      if (parts[0].toLowerCase() === "remote" || parts[0].toLowerCase() === "virtual") {
        remoteType = "Remote";
      } else {
        const potentialCountry = toCanonicalCountry(parts[0]);
        if (potentialCountry) {
          country = potentialCountry;
        } else {
          city = parts[0];
        }
      }
    } else if (parts.length === 2) {
      city = parts[0];
      const second = parts[1].toUpperCase();
      if (US_STATES[second]) {
        state = US_STATES[second];
        country = "United States";
      } else {
        country = parts[1];
      }
    } else if (parts.length >= 3) {
      city = parts[0];
      const second = parts[1].toUpperCase();
      state = US_STATES[second] || parts[1];
      country = parts.slice(2).join(", ");
    }
  }

  // If location is still empty, attempt to extract from description text (e.g. "team based in Clacton-on-Sea")
  if (!locationStr && descriptionContext) {
    const inlineMatch = descriptionContext.match(/(?:based in|located in|working in|position based at|office in)\s+([A-Z][a-zA-Z\s-]+(?:-on-[A-Z][a-zA-Z-]+)?(?:,\s*[A-Z][a-zA-Z\s]+)?)/i);
    if (inlineMatch && inlineMatch[1] && inlineMatch[1].trim().length < 50) {
      const extracted = inlineMatch[1].trim().replace(/[.,;]+$/, "");
      locationStr = extracted;
      city = extracted;
    }
  }

  // Infer country from city/region/postal code if not explicitly given
  if (!country && locationStr) {
    const locLower = locationStr.toLowerCase();
    if (UK_POSTCODE_REGEX.test(locationStr)) {
      country = "United Kingdom";
    } else {
      for (const ukRegion of UK_REGIONS) {
        const regex = new RegExp(`\\b${ukRegion}\\b`, "i");
        if (regex.test(locLower)) {
          country = "United Kingdom";
          break;
        }
      }
    }

    if (!country) {
      for (const inCity of INDIA_CITIES) {
        const regex = new RegExp(`\\b${inCity}\\b`, "i");
        if (regex.test(locLower)) {
          country = "India";
          break;
        }
      }
    }
  }

  // Fallback to defaultCountry if still unresolved
  if (!country && defaultCountry) {
    country = defaultCountry;
  }

  // Canonicalize country name (e.g. UK -> United Kingdom, USA -> United States, IN -> India)
  const canonicalCountry = toCanonicalCountry(country);

  // Format final consolidated location string
  const assembled = [city, state, canonicalCountry || country].filter(Boolean).join(", ");
  const finalLocation = assembled || locationStr || (remoteType ? "Remote" : null);

  return {
    location: finalLocation,
    country: canonicalCountry || country,
    state,
    city,
    remote_type: remoteType,
  };
}
