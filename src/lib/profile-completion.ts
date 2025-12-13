import { Candidate } from "@prisma/client";

/**
 * Calculate profile completion percentage for a candidate
 * Returns a percentage from 0 to 100 based on filled fields
 * @param candidate - Candidate object with optional educationEntries relation
 */
export function calculateProfileCompletion(candidate: Partial<Candidate> & { educationEntries?: any[] }): number {
  // Define which fields contribute to profile completion
  const fields = [
    { key: "phone", weight: 5 },
    { key: "resume", weight: 15 },
    { key: "portfolio", weight: 10 },
    { key: "linkedIn", weight: 10 },
    { key: "github", weight: 10 },
    { key: "bio", weight: 15 },
    { key: "skills", weight: 15, isArray: true },
    { key: "experience", weight: 5 },
    { key: "educationEntries", weight: 10, isArray: true }, // Use educationEntries relation instead of deprecated education field
    { key: "location", weight: 5 },
  ];

  let totalWeight = 0;
  let completedWeight = 0;

  for (const field of fields) {
    totalWeight += field.weight;

    const value = (candidate as any)[field.key];

    // Check if field is filled
    let isFilled = false;

    if (field.isArray) {
      // For arrays, check if not empty
      isFilled = Array.isArray(value) && value.length > 0;
    } else {
      // For other fields, check if truthy and not empty string
      isFilled = value !== null && value !== undefined && value !== "";
    }

    if (isFilled) {
      completedWeight += field.weight;
    }
  }

  // Calculate percentage
  const percentage = Math.round((completedWeight / totalWeight) * 100);

  return percentage;
}

/**
 * Get profile completion status and missing fields
 */
export function getProfileCompletionStatus(candidate: any) {
  try {
    const percentage = calculateProfileCompletion(candidate);

    const missingFields: string[] = [];

    // Check critical fields
    if (!candidate.resume) missingFields.push("resume");
    if (!candidate.bio) missingFields.push("bio");
    if (!candidate.skills || !Array.isArray(candidate.skills) || candidate.skills.length === 0) {
      missingFields.push("skills");
    }
    // Check educationEntries relation instead of deprecated education field
    if (!candidate.educationEntries || !Array.isArray(candidate.educationEntries) || candidate.educationEntries.length === 0) {
      missingFields.push("education");
    }
    if (!candidate.location) missingFields.push("location");

    // Determine status
    let status: "incomplete" | "basic" | "good" | "excellent";
    if (percentage < 30) {
      status = "incomplete";
    } else if (percentage < 60) {
      status = "basic";
    } else if (percentage < 90) {
      status = "good";
    } else {
      status = "excellent";
    }

    return {
      percentage,
      status,
      missingFields,
    };
  } catch (error) {
    console.error("[Profile Completion] Error calculating completion status:", error);
    // Return safe defaults if calculation fails
    return {
      percentage: 0,
      status: "incomplete" as const,
      missingFields: ["resume", "bio", "skills", "education", "location"],
    };
  }
}
