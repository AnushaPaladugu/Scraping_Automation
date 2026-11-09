/**
 * Country Normalization and Synonym Resolution Engine
 * Handles canonical resolution for UK/GB, US/USA, India/IN, and global countries.
 */

interface CountryDefinition {
  canonical: string;
  aliases: string[];
}

const COUNTRY_DEFINITIONS: CountryDefinition[] = [
  {
    canonical: "United Kingdom",
    aliases: [
      "united kingdom",
      "uk",
      "u.k.",
      "u.k",
      "gb",
      "gbr",
      "great britain",
      "britain",
      "england",
      "scotland",
      "wales",
      "northern ireland",
    ],
  },
  {
    canonical: "United States",
    aliases: [
      "united states",
      "united states of america",
      "usa",
      "u.s.a.",
      "u.s.",
      "u.s",
      "us",
      "america",
    ],
  },
  {
    canonical: "India",
    aliases: ["india", "in", "ind", "bharat", "hindustan"],
  },
  {
    canonical: "Canada",
    aliases: ["canada", "ca", "can"],
  },
  {
    canonical: "Australia",
    aliases: ["australia", "au", "aus"],
  },
  {
    canonical: "Germany",
    aliases: ["germany", "de", "deu", "deutschland"],
  },
  {
    canonical: "France",
    aliases: ["france", "fr", "fra"],
  },
  {
    canonical: "Singapore",
    aliases: ["singapore", "sg", "sgp"],
  },
  {
    canonical: "Ireland",
    aliases: ["ireland", "ie", "irl"],
  },
  {
    canonical: "Netherlands",
    aliases: ["netherlands", "nl", "nld", "holland"],
  },
  {
    canonical: "Switzerland",
    aliases: ["switzerland", "ch", "che", "swiss"],
  },
  {
    canonical: "Spain",
    aliases: ["spain", "es", "esp", "espana", "españa"],
  },
  {
    canonical: "Italy",
    aliases: ["italy", "it", "ita", "italia"],
  },
  {
    canonical: "Poland",
    aliases: ["poland", "pl", "pol", "polska"],
  },
  {
    canonical: "Sweden",
    aliases: ["sweden", "se", "swe", "sverige"],
  },
  {
    canonical: "Japan",
    aliases: ["japan", "jp", "jpn", "nippon"],
  },
  {
    canonical: "China",
    aliases: ["china", "cn", "chn", "prc"],
  },
  {
    canonical: "Brazil",
    aliases: ["brazil", "brasil", "br", "bra"],
  },
  {
    canonical: "Mexico",
    aliases: ["mexico", "mx", "mex", "méxico"],
  },
  {
    canonical: "United Arab Emirates",
    aliases: ["united arab emirates", "uae", "ae", "are", "dubai", "abu dhabi"],
  },
  {
    canonical: "South Africa",
    aliases: ["south africa", "za", "zaf", "rsa"],
  },
  {
    canonical: "New Zealand",
    aliases: ["new zealand", "nz", "nzl"],
  },
  {
    canonical: "Philippines",
    aliases: ["philippines", "ph", "phl"],
  },
  {
    canonical: "Portugal",
    aliases: ["portugal", "pt", "prt"],
  },
  {
    canonical: "Belgium",
    aliases: ["belgium", "be", "bel", "belgique", "belgië"],
  },
  {
    canonical: "Austria",
    aliases: ["austria", "at", "aut", "österreich"],
  },
  {
    canonical: "Denmark",
    aliases: ["denmark", "dk", "dnk", "danmark"],
  },
  {
    canonical: "Norway",
    aliases: ["norway", "no", "nor", "norge"],
  },
  {
    canonical: "Finland",
    aliases: ["finland", "fi", "fin", "suomi"],
  },
  {
    canonical: "Israel",
    aliases: ["israel", "il", "isr"],
  },
  {
    canonical: "Malaysia",
    aliases: ["malaysia", "my", "mys"],
  },
  {
    canonical: "Indonesia",
    aliases: ["indonesia", "id", "idn"],
  },
  {
    canonical: "Hong Kong",
    aliases: ["hong kong", "hk", "hkg"],
  },
  {
    canonical: "South Korea",
    aliases: ["south korea", "korea", "kr", "kor", "republic of korea"],
  },
  {
    canonical: "Saudi Arabia",
    aliases: ["saudi arabia", "sa", "sau", "ksa"],
  },
];

// Build index maps for fast O(1) lookup
const ALIAS_TO_DEF = new Map<string, CountryDefinition>();

function cleanKey(val: string): string {
  return val.toLowerCase().replace(/[^a-z0-9]/g, "");
}

for (const def of COUNTRY_DEFINITIONS) {
  for (const alias of def.aliases) {
    const k = cleanKey(alias);
    if (k) ALIAS_TO_DEF.set(k, def);
  }
  const canKey = cleanKey(def.canonical);
  if (canKey) ALIAS_TO_DEF.set(canKey, def);
}

/**
 * Escapes regex special characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves any raw country input, code, or alias to its canonical country name.
 * e.g. "UK" -> "United Kingdom", "USA" -> "United States", "IN" -> "India"
 */
export function toCanonicalCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const key = cleanKey(trimmed);
  const def = ALIAS_TO_DEF.get(key);
  if (def) return def.canonical;

  return trimmed;
}

/**
 * Gets all known aliases for a country input
 */
export function getCountryAliases(input: string): string[] {
  if (!input) return [];
  const key = cleanKey(input);
  const def = ALIAS_TO_DEF.get(key);
  if (def) {
    return Array.from(new Set([def.canonical.toLowerCase(), ...def.aliases]));
  }
  return [input.toLowerCase().trim()];
}

/**
 * Determines whether a job's country or location matches the requested country filter.
 *
 * Handles:
 * - UK / United Kingdom / GB / Great Britain / England
 * - USA / US / United States / United States of America
 * - India / IN / IND
 * - Word-boundary matching for short codes to prevent false substring positives
 *   (e.g. "IN" won't match "United Kingdom", "Austin", or "Berlin").
 */
export function matchesCountryFilter(
  jobCountry: string | null | undefined,
  jobLocation: string | null | undefined,
  filterInput: string | null | undefined
): boolean {
  if (!filterInput || !filterInput.trim()) return true;

  const filterRaw = filterInput.trim();
  const filterCanonical = toCanonicalCountry(filterRaw);
  const filterKey = cleanKey(filterRaw);
  const filterAliases = getCountryAliases(filterRaw);

  // 1. Direct canonical comparison on jobCountry
  if (jobCountry) {
    const jobCanonical = toCanonicalCountry(jobCountry);
    if (filterCanonical && jobCanonical && filterCanonical.toLowerCase() === jobCanonical.toLowerCase()) {
      return true;
    }

    const jobCountryClean = cleanKey(jobCountry);
    if (jobCountryClean === filterKey) {
      return true;
    }

    for (const alias of filterAliases) {
      if (cleanKey(alias) === jobCountryClean) {
        return true;
      }
    }
  }

  // 2. Location string check
  if (jobLocation) {
    const locationLower = jobLocation.toLowerCase();

    // Check each alias against location text
    for (const alias of filterAliases) {
      const aliasClean = alias.trim();
      if (!aliasClean) continue;

      if (aliasClean.length <= 3) {
        // Strict word boundary check for short 2-3 letter codes (e.g. "UK", "GB", "US", "IN")
        const regex = new RegExp(`\\b${escapeRegExp(aliasClean)}\\b`, "i");
        if (regex.test(jobLocation)) {
          return true;
        }
      } else {
        // Longer country names (e.g. "united kingdom", "united states", "india")
        if (locationLower.includes(aliasClean)) {
          return true;
        }
      }
    }
  }

  return false;
}
