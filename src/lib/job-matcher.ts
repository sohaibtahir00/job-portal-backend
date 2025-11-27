/**
 * Job Matching Algorithm
 * Calculates match scores between candidates and jobs based on various criteria
 */

import { ExperienceLevel } from "@prisma/client";

export interface CandidateForMatching {
  id: string;
  skills: string[];
  nicheCategory: string | null;
  experience: number | null;
  expectedSalary: number | null;
  location: string | null;
  remotePreference: string | null;
  willingToRelocate: boolean;
  preferredJobType: string | null;
  desiredRoles: string[];
}

export interface JobForMatching {
  id: string;
  title: string;
  skills: string[];
  nicheCategory: string | null;
  experienceLevel: ExperienceLevel;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string;
  remote: boolean;
  remoteType: string | null;
  type: string;
}

export interface MatchBreakdown {
  skills: number;
  niche: number;
  experience: number;
  salary: number;
  location: number;
}

export interface MatchScore {
  overall: number;
  breakdown: MatchBreakdown;
  reasons: string[];
  matchingSkills: string[];
  missingSkills: string[];
}

// Related niches mapping - niches that have transferable skills
const RELATED_NICHES: Record<string, string[]> = {
  "AI_ML": ["FINTECH", "HEALTHCARE_IT"],
  "AI/ML": ["Fintech", "Healthcare IT"],
  "HEALTHCARE_IT": ["AI_ML", "CYBERSECURITY"],
  "Healthcare IT": ["AI/ML", "Cybersecurity"],
  "FINTECH": ["AI_ML", "CYBERSECURITY"],
  "Fintech": ["AI/ML", "Cybersecurity"],
  "CYBERSECURITY": ["FINTECH", "HEALTHCARE_IT"],
  "Cybersecurity": ["Fintech", "Healthcare IT"],
};

// Experience level to years mapping
const EXPERIENCE_LEVEL_YEARS: Record<ExperienceLevel, number> = {
  ENTRY_LEVEL: 0,
  MID_LEVEL: 3,
  SENIOR_LEVEL: 5,
  EXECUTIVE: 10,
};

// Weight configuration
const WEIGHTS = {
  skills: 0.40,
  niche: 0.25,
  experience: 0.15,
  salary: 0.10,
  location: 0.10,
};

/**
 * Normalize a string for comparison (lowercase, trim, remove special chars)
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two strings match (case-insensitive, fuzzy)
 */
function stringsMatch(a: string, b: string): boolean {
  const normalA = normalizeString(a);
  const normalB = normalizeString(b);

  // Exact match
  if (normalA === normalB) return true;

  // One contains the other (for things like "Python" matching "Python 3")
  if (normalA.includes(normalB) || normalB.includes(normalA)) return true;

  // Common abbreviations/variations
  const variations: Record<string, string[]> = {
    'javascript': ['js', 'nodejs', 'node'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'machinelearning': ['ml'],
    'artificialintelligence': ['ai'],
    'kubernetes': ['k8s'],
    'amazon': ['aws'],
    'google': ['gcp'],
    'microsoft': ['azure'],
    'react': ['reactjs'],
    'vue': ['vuejs'],
    'angular': ['angularjs'],
    'postgresql': ['postgres'],
    'mongodb': ['mongo'],
    'tensorflow': ['tf'],
    'pytorch': ['torch'],
  };

  for (const [key, aliases] of Object.entries(variations)) {
    if ((normalA === key || aliases.includes(normalA)) &&
        (normalB === key || aliases.includes(normalB))) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate skills match score
 */
function calculateSkillsMatch(
  candidateSkills: string[],
  jobSkills: string[]
): { score: number; matching: string[]; missing: string[] } {
  if (jobSkills.length === 0) {
    return { score: 100, matching: [], missing: [] };
  }

  if (candidateSkills.length === 0) {
    return { score: 0, matching: [], missing: jobSkills };
  }

  const matching: string[] = [];
  const missing: string[] = [];

  for (const jobSkill of jobSkills) {
    const hasSkill = candidateSkills.some(cs => stringsMatch(cs, jobSkill));
    if (hasSkill) {
      matching.push(jobSkill);
    } else {
      missing.push(jobSkill);
    }
  }

  const score = Math.round((matching.length / jobSkills.length) * 100);
  return { score, matching, missing };
}

/**
 * Calculate niche category match score
 */
function calculateNicheMatch(
  candidateNiche: string | null,
  jobNiche: string | null
): number {
  if (!jobNiche) return 80; // No specific niche requirement
  if (!candidateNiche) return 50; // Candidate hasn't specified, partial match

  // Normalize for comparison
  const normalCandidate = normalizeString(candidateNiche);
  const normalJob = normalizeString(jobNiche);

  // Exact match
  if (normalCandidate === normalJob) return 100;

  // Check for related niches
  const relatedToCandidate = RELATED_NICHES[candidateNiche] || [];
  for (const related of relatedToCandidate) {
    if (normalizeString(related) === normalJob) {
      return 60; // Related niche
    }
  }

  return 20; // Different niche
}

/**
 * Calculate experience match score
 */
function calculateExperienceMatch(
  candidateExperience: number | null,
  jobLevel: ExperienceLevel
): number {
  if (candidateExperience === null) return 50; // Unknown experience

  const requiredYears = EXPERIENCE_LEVEL_YEARS[jobLevel];
  const diff = candidateExperience - requiredYears;

  if (diff >= 0 && diff <= 3) {
    // Perfect fit or slightly overqualified
    return 100;
  } else if (diff > 3 && diff <= 6) {
    // Overqualified but acceptable
    return 80;
  } else if (diff > 6) {
    // Significantly overqualified
    return 60;
  } else if (diff >= -1) {
    // Slightly underqualified (1 year off)
    return 70;
  } else if (diff >= -2) {
    // Underqualified by 2 years
    return 50;
  } else {
    // Significantly underqualified
    return Math.max(0, 30 + (diff * 5));
  }
}

/**
 * Calculate salary match score
 */
function calculateSalaryMatch(
  expectedSalary: number | null,
  salaryMin: number | null,
  salaryMax: number | null
): number {
  if (!expectedSalary) return 70; // No expectation specified
  if (!salaryMax && !salaryMin) return 70; // No salary range specified

  const jobMax = salaryMax || salaryMin || 0;
  const jobMin = salaryMin || salaryMax || 0;

  if (expectedSalary <= jobMax) {
    // Job pays at or above expectations
    return 100;
  } else if (expectedSalary <= jobMax * 1.1) {
    // Within 10% of expectations
    return 85;
  } else if (expectedSalary <= jobMax * 1.2) {
    // Within 20% of expectations
    return 70;
  } else {
    // Below expectations
    return Math.max(0, Math.round((jobMax / expectedSalary) * 100));
  }
}

/**
 * Calculate location match score
 */
function calculateLocationMatch(
  candidateLocation: string | null,
  candidateRemotePreference: string | null,
  willingToRelocate: boolean,
  jobLocation: string,
  jobRemote: boolean,
  jobRemoteType: string | null
): number {
  const isJobRemote = jobRemote || jobRemoteType === 'REMOTE';
  const isJobHybrid = jobRemoteType === 'HYBRID';

  // Perfect remote match
  if (isJobRemote && candidateRemotePreference === 'REMOTE') {
    return 100;
  }

  // Remote job but candidate prefers onsite - still good
  if (isJobRemote) {
    return 90;
  }

  // Hybrid job with hybrid preference
  if (isJobHybrid && candidateRemotePreference === 'HYBRID') {
    return 100;
  }

  // Check location match for non-remote jobs
  if (candidateLocation) {
    const normalCandidateLocation = normalizeString(candidateLocation);
    const normalJobLocation = normalizeString(jobLocation);

    // Same location
    if (normalCandidateLocation === normalJobLocation ||
        normalJobLocation.includes(normalCandidateLocation) ||
        normalCandidateLocation.includes(normalJobLocation)) {
      return 100;
    }
  }

  // Willing to relocate
  if (willingToRelocate) {
    return 75;
  }

  // Hybrid/onsite job but candidate prefers remote
  if (candidateRemotePreference === 'REMOTE') {
    return 30;
  }

  // Default for location mismatch
  return 40;
}

/**
 * Generate human-readable reasons for the match
 */
function generateReasons(
  breakdown: MatchBreakdown,
  matchingSkillsCount: number,
  totalSkillsCount: number,
  candidate: CandidateForMatching,
  job: JobForMatching
): string[] {
  const reasons: string[] = [];

  // Skills reasons
  if (breakdown.skills >= 90) {
    reasons.push(`Excellent skills match: ${matchingSkillsCount} of ${totalSkillsCount} required skills`);
  } else if (breakdown.skills >= 70) {
    reasons.push(`Strong skills match: ${matchingSkillsCount} of ${totalSkillsCount} required skills`);
  } else if (breakdown.skills >= 50) {
    reasons.push(`Partial skills match: ${matchingSkillsCount} of ${totalSkillsCount} required skills`);
  }

  // Niche reasons
  if (breakdown.niche === 100) {
    reasons.push(`Perfect niche match: ${job.nicheCategory || 'Tech'}`);
  } else if (breakdown.niche >= 60) {
    reasons.push(`Related niche experience applicable`);
  }

  // Experience reasons
  if (breakdown.experience >= 90) {
    reasons.push(`Experience level is an excellent fit`);
  } else if (breakdown.experience >= 70) {
    reasons.push(`Experience level is a good match`);
  }

  // Salary reasons
  if (breakdown.salary >= 100) {
    reasons.push(`Salary meets or exceeds your expectations`);
  } else if (breakdown.salary >= 85) {
    reasons.push(`Salary is close to your expectations`);
  }

  // Location reasons
  if (breakdown.location >= 100) {
    if (job.remote || job.remoteType === 'REMOTE') {
      reasons.push(`Remote position matches your preference`);
    } else {
      reasons.push(`Location matches your preference`);
    }
  } else if (breakdown.location >= 75 && candidate.willingToRelocate) {
    reasons.push(`Open to relocation for this opportunity`);
  }

  // Job type match
  if (candidate.preferredJobType &&
      normalizeString(candidate.preferredJobType) === normalizeString(job.type)) {
    reasons.push(`Matches your preferred job type: ${job.type.replace('_', ' ')}`);
  }

  return reasons;
}

/**
 * Calculate overall match score between a candidate and a job
 */
export function calculateJobMatch(
  candidate: CandidateForMatching,
  job: JobForMatching
): MatchScore {
  // Calculate individual scores
  const skillsResult = calculateSkillsMatch(candidate.skills, job.skills);
  const nicheScore = calculateNicheMatch(candidate.nicheCategory, job.nicheCategory);
  const experienceScore = calculateExperienceMatch(candidate.experience, job.experienceLevel);
  const salaryScore = calculateSalaryMatch(candidate.expectedSalary, job.salaryMin, job.salaryMax);
  const locationScore = calculateLocationMatch(
    candidate.location,
    candidate.remotePreference,
    candidate.willingToRelocate,
    job.location,
    job.remote,
    job.remoteType
  );

  // Build breakdown
  const breakdown: MatchBreakdown = {
    skills: skillsResult.score,
    niche: nicheScore,
    experience: experienceScore,
    salary: salaryScore,
    location: locationScore,
  };

  // Calculate weighted overall score
  const overall = Math.round(
    (breakdown.skills * WEIGHTS.skills) +
    (breakdown.niche * WEIGHTS.niche) +
    (breakdown.experience * WEIGHTS.experience) +
    (breakdown.salary * WEIGHTS.salary) +
    (breakdown.location * WEIGHTS.location)
  );

  // Generate reasons
  const reasons = generateReasons(
    breakdown,
    skillsResult.matching.length,
    job.skills.length,
    candidate,
    job
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    breakdown,
    reasons,
    matchingSkills: skillsResult.matching,
    missingSkills: skillsResult.missing,
  };
}

/**
 * Sort jobs by match score (highest first)
 */
export function sortJobsByMatch(
  jobs: Array<{ job: JobForMatching; matchScore: MatchScore }>
): Array<{ job: JobForMatching; matchScore: MatchScore }> {
  return jobs.sort((a, b) => b.matchScore.overall - a.matchScore.overall);
}

/**
 * Filter jobs by minimum match score
 */
export function filterJobsByMinScore(
  jobs: Array<{ job: JobForMatching; matchScore: MatchScore }>,
  minScore: number
): Array<{ job: JobForMatching; matchScore: MatchScore }> {
  return jobs.filter(j => j.matchScore.overall >= minScore);
}
