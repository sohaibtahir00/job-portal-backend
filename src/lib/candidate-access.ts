import { prisma } from "@/lib/prisma";
import { IntroductionStatus, CandidateResponse } from "@prisma/client";

/**
 * Access levels for candidate profile viewing
 */
export type CandidateAccessLevel =
  | "NO_AGREEMENT"      // Employer hasn't signed service agreement
  | "AGREEMENT_SIGNED"  // Agreement signed, but no introduction or pending
  | "FULL_ACCESS";      // Introduction accepted, full profile visible

/**
 * Introduction status for the employer-candidate pair
 */
export type IntroductionStatusInfo =
  | "NONE"              // No introduction record exists
  | "PROFILE_VIEWED"    // Profile was viewed but no intro requested
  | "REQUESTED"         // Introduction requested, waiting for candidate
  | "PENDING"           // Candidate has questions or is considering
  | "DECLINED"          // Candidate declined the introduction
  | "INTRODUCED"        // Full introduction - candidate accepted
  | "INTERVIEWING"      // In interview process
  | "OFFER_EXTENDED"    // Offer extended
  | "HIRED"             // Successfully hired
  | "CLOSED_NO_HIRE"    // Closed without hire
  | "EXPIRED";          // Introduction expired

/**
 * Result of checking employer's access to a candidate
 */
export interface EmployerCandidateAccess {
  accessLevel: CandidateAccessLevel;
  introductionStatus: IntroductionStatusInfo;
  hasSignedAgreement: boolean;
  introductionId: string | null;
  protectionEndsAt: Date | null;
  canViewContactInfo: boolean;
}

/**
 * Check employer's access level for a specific candidate
 * This determines what data can be shown to the employer
 */
export async function getEmployerAccessLevel(
  employerId: string,
  candidateId: string
): Promise<EmployerCandidateAccess> {
  // Check if employer has signed service agreement
  const serviceAgreement = await prisma.serviceAgreement.findUnique({
    where: { employerId },
  });

  if (!serviceAgreement) {
    return {
      accessLevel: "NO_AGREEMENT",
      introductionStatus: "NONE",
      hasSignedAgreement: false,
      introductionId: null,
      protectionEndsAt: null,
      canViewContactInfo: false,
    };
  }

  // Check introduction status
  const introduction = await prisma.candidateIntroduction.findUnique({
    where: {
      employerId_candidateId: {
        employerId,
        candidateId,
      },
    },
  });

  if (!introduction) {
    return {
      accessLevel: "AGREEMENT_SIGNED",
      introductionStatus: "NONE",
      hasSignedAgreement: true,
      introductionId: null,
      protectionEndsAt: null,
      canViewContactInfo: false,
    };
  }

  // Map introduction status to our info type
  let introStatusInfo: IntroductionStatusInfo;

  switch (introduction.status) {
    case IntroductionStatus.PROFILE_VIEWED:
      introStatusInfo = "PROFILE_VIEWED";
      break;
    case IntroductionStatus.INTRO_REQUESTED:
      introStatusInfo = "REQUESTED";
      break;
    case IntroductionStatus.CANDIDATE_DECLINED:
      introStatusInfo = "DECLINED";
      break;
    case IntroductionStatus.INTRODUCED:
      introStatusInfo = "INTRODUCED";
      break;
    case IntroductionStatus.INTERVIEWING:
      introStatusInfo = "INTERVIEWING";
      break;
    case IntroductionStatus.OFFER_EXTENDED:
      introStatusInfo = "OFFER_EXTENDED";
      break;
    case IntroductionStatus.HIRED:
      introStatusInfo = "HIRED";
      break;
    case IntroductionStatus.CLOSED_NO_HIRE:
      introStatusInfo = "CLOSED_NO_HIRE";
      break;
    case IntroductionStatus.EXPIRED:
      introStatusInfo = "EXPIRED";
      break;
    default:
      introStatusInfo = "NONE";
  }

  // Check if candidate response indicates they declined
  if (introduction.candidateResponse === CandidateResponse.DECLINED) {
    introStatusInfo = "DECLINED";
  } else if (introduction.candidateResponse === CandidateResponse.QUESTIONS) {
    introStatusInfo = "PENDING";
  }

  // Full access is granted when:
  // 1. Introduction status is INTRODUCED or beyond (INTERVIEWING, OFFER_EXTENDED, HIRED)
  // 2. Candidate has accepted (candidateResponse === ACCEPTED)
  const hasFullAccess =
    introduction.status === IntroductionStatus.INTRODUCED ||
    introduction.status === IntroductionStatus.INTERVIEWING ||
    introduction.status === IntroductionStatus.OFFER_EXTENDED ||
    introduction.status === IntroductionStatus.HIRED ||
    introduction.candidateResponse === CandidateResponse.ACCEPTED;

  return {
    accessLevel: hasFullAccess ? "FULL_ACCESS" : "AGREEMENT_SIGNED",
    introductionStatus: introStatusInfo,
    hasSignedAgreement: true,
    introductionId: introduction.id,
    protectionEndsAt: introduction.protectionEndsAt,
    canViewContactInfo: hasFullAccess,
  };
}

/**
 * Get employer ID from user ID
 */
export async function getEmployerIdFromUserId(userId: string): Promise<string | null> {
  const employer = await prisma.employer.findUnique({
    where: { userId },
    select: { id: true },
  });
  return employer?.id || null;
}

/**
 * Parse a full name into first name and last initial
 */
export function getGatedName(fullName: string | null): { firstName: string; lastInitial: string } {
  if (!fullName) {
    return { firstName: "Unknown", lastInitial: "" };
  }

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "Unknown";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1].charAt(0) + "." : "";

  return { firstName, lastInitial };
}

/**
 * Type for gated candidate preview (list view - no agreement needed)
 */
export interface GatedCandidatePreview {
  id: string;
  firstName: string;
  lastInitial: string;
  profileImage: string | null;
  location: string | null;
  yearsExperience: number | null;
  currentTitle: string | null;
  skills: string[];
  skillsScore: number | null;
  skillsTier: string | null;
  skillsPercentile: number | null;
  availability: boolean;
  createdAt: Date;
}

/**
 * Type for candidate profile with agreement signed (no contact info)
 */
export interface AgreementSignedCandidateProfile {
  id: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  location: string | null;
  yearsExperience: number | null;
  currentTitle: string | null;
  currentCompany: string | null;
  bio: string | null;
  skills: string[];
  skillsScore: number | null;
  skillsTier: string | null;
  skillsPercentile: number | null;
  workExperience: any[];
  education: any[];
  availability: boolean;
  preferredJobType: string | null;
  expectedSalary: number | null;
  // Contact info is null/hidden
  email: null;
  phone: null;
  linkedIn: null;
  github: null;
  portfolio: null;
  personalWebsite: null;
  resume: null;
  // Access metadata
  _accessLevel: "AGREEMENT_SIGNED";
  _introductionStatus: IntroductionStatusInfo;
  _contactGated: true;
  _introductionId: string | null;
  _protectionEndsAt: Date | null;
}

/**
 * Type for full candidate profile (after introduction accepted)
 */
export interface FullAccessCandidateProfile {
  id: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  location: string | null;
  yearsExperience: number | null;
  currentTitle: string | null;
  currentCompany: string | null;
  bio: string | null;
  skills: string[];
  skillsScore: number | null;
  skillsTier: string | null;
  skillsPercentile: number | null;
  workExperience: any[];
  education: any[];
  availability: boolean;
  preferredJobType: string | null;
  expectedSalary: number | null;
  // Full contact info
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  github: string | null;
  portfolio: string | null;
  personalWebsite: string | null;
  resume: string | null;
  // Access metadata
  _accessLevel: "FULL_ACCESS";
  _introductionStatus: IntroductionStatusInfo;
  _contactGated: false;
  _introductionId: string | null;
  _protectionEndsAt: Date | null;
}

export type CandidateProfileResponse =
  | AgreementSignedCandidateProfile
  | FullAccessCandidateProfile;
