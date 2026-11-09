import { describe, it, expect } from "vitest";
import {
  toCanonicalCountry,
  getCountryAliases,
  matchesCountryFilter,
} from "../src/utils/countryMatcher";

describe("Country Normalization and Synonym Matcher", () => {
  it("should canonicalize UK variants", () => {
    expect(toCanonicalCountry("UK")).toBe("United Kingdom");
    expect(toCanonicalCountry("uk")).toBe("United Kingdom");
    expect(toCanonicalCountry("GB")).toBe("United Kingdom");
    expect(toCanonicalCountry("Great Britain")).toBe("United Kingdom");
    expect(toCanonicalCountry("England")).toBe("United Kingdom");
    expect(toCanonicalCountry("United Kingdom")).toBe("United Kingdom");
  });

  it("should canonicalize US variants", () => {
    expect(toCanonicalCountry("USA")).toBe("United States");
    expect(toCanonicalCountry("US")).toBe("United States");
    expect(toCanonicalCountry("United States")).toBe("United States");
    expect(toCanonicalCountry("United States of America")).toBe("United States");
  });

  it("should canonicalize India variants", () => {
    expect(toCanonicalCountry("India")).toBe("India");
    expect(toCanonicalCountry("IN")).toBe("India");
    expect(toCanonicalCountry("IND")).toBe("India");
    expect(toCanonicalCountry("Bharat")).toBe("India");
  });

  it("should match UK filter with United Kingdom job location/country", () => {
    // User types "UK", job has country: "United Kingdom"
    expect(matchesCountryFilter("United Kingdom", "London, London, United Kingdom", "UK")).toBe(true);

    // User types "United Kingdom", job has country: "UK"
    expect(matchesCountryFilter("UK", "London, UK", "United Kingdom")).toBe(true);

    // User types "GB", job has location: "Manchester, England, United Kingdom"
    expect(matchesCountryFilter("United Kingdom", "Manchester, England, United Kingdom", "GB")).toBe(true);

    // User types "UK", job has country null but location: "London, UK"
    expect(matchesCountryFilter(null, "London, UK", "UK")).toBe(true);
  });

  it("should match US filter with USA/United States variants", () => {
    // User types "USA", job has country: "United States"
    expect(matchesCountryFilter("United States", "Austin, TX, United States", "USA")).toBe(true);

    // User types "US", job has location: "New York, NY, USA"
    expect(matchesCountryFilter("United States", "New York, NY, USA", "US")).toBe(true);

    // User types "United States", job has country: "US"
    expect(matchesCountryFilter("US", "Remote - US", "United States")).toBe(true);
  });

  it("should match India filter with IN/India variants", () => {
    // User types "India", job has country: "IN"
    expect(matchesCountryFilter("IN", "Bengaluru, IN", "India")).toBe(true);

    // User types "IN", job has country: "India"
    expect(matchesCountryFilter("India", "Hyderabad, Telangana, India", "IN")).toBe(true);

    // User types "India", job has location: "Pune, India"
    expect(matchesCountryFilter(null, "Pune, India", "India")).toBe(true);
  });

  it("should NOT cause false positives with short codes", () => {
    // "IN" must NOT match "United Kingdom" (even though "in" is substring of kingdom)
    expect(matchesCountryFilter("United Kingdom", "London, United Kingdom", "IN")).toBe(false);

    // "IN" must NOT match "Austin, TX, United States"
    expect(matchesCountryFilter("United States", "Austin, TX, United States", "IN")).toBe(false);

    // "US" must NOT match "Customer Support, Australia"
    expect(matchesCountryFilter("Australia", "Sydney, Australia", "US")).toBe(false);
  });
});
