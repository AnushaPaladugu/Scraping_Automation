import { EmploymentType } from "../types/job";

export function processEmploymentType(rawType: any): EmploymentType {
  if (!rawType) return null;
  const str = String(rawType).toLowerCase().trim();

  if (str.includes("full") || str.includes("permanent") || str.includes("regular") || str.includes("direct")) {
    return "Full-time";
  }
  if (str.includes("part")) {
    return "Part-time";
  }
  if (str.includes("contract") || str.includes("freelance") || str.includes("fixed_term") || str.includes("temp_to_hire")) {
    return "Contract";
  }
  if (str.includes("intern") || str.includes("co-op") || str.includes("apprentice")) {
    return "Internship";
  }
  if (str.includes("temp") || str.includes("casual") || str.includes("seasonal")) {
    return "Temporary";
  }

  return null;
}
