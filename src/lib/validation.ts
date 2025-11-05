/**
 * Zod Validation Schemas for API Inputs
 *
 * Centralized validation schemas for all API endpoints
 * using Zod for type-safe runtime validation.
 */

import { z } from "zod";
import {
  UserRole,
  JobType,
  RemoteType,
  ExperienceLevel,
  JobStatus,
  ApplicationStatus,
  PaymentStatus,
  PlacementStatus,
} from "@prisma/client";

// ===========================
// Common/Shared Schemas
// ===========================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

export const emailSchema = z.string().email("Invalid email address").toLowerCase();

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
  .optional();

export const urlSchema = z.string().url("Invalid URL format").optional();

export const dateStringSchema = z.string().datetime("Invalid date format");

// ===========================
// Auth Schemas
// ===========================

export const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.nativeEnum(UserRole),
  // Candidate-specific fields
  phone: phoneSchema,
  location: z.string().max(200).optional(),
  niche: z.string().max(100).optional(),
  // Employer-specific fields
  companyName: z.string().min(2).max(200).optional(),
  companyWebsite: urlSchema,
  industry: z.string().max(100).optional(),
  companySize: z.string().max(50).optional(),
  // Referral
  referralCode: z.string().optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

// ===========================
// Job Schemas
// ===========================

export const createJobSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(50, "Description must be at least 50 characters"),
  requirements: z.string().min(20, "Requirements must be at least 20 characters"),
  responsibilities: z.string().min(20, "Responsibilities must be at least 20 characters"),
  type: z.nativeEnum(JobType),
  location: z.string().min(2).max(200),
  remoteType: z.nativeEnum(RemoteType),
  experienceLevel: z.nativeEnum(ExperienceLevel),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  skills: z.array(z.string()).min(1, "At least one skill is required").max(20),
  benefits: z.string().optional(),
  deadline: dateStringSchema.optional(),
});

export const updateJobSchema = createJobSchema.partial();

export const jobSearchSchema = z.object({
  q: z.string().optional(),
  type: z.nativeEnum(JobType).optional(),
  location: z.string().optional(),
  remote: z.nativeEnum(RemoteType).optional(),
  experienceLevel: z.nativeEnum(ExperienceLevel).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryMax: z.coerce.number().int().min(0).optional(),
  skills: z.string().optional(), // Comma-separated
  companyName: z.string().optional(),
  postedWithin: z.coerce.number().int().min(1).max(365).optional(), // Days
  sortBy: z
    .enum(["newest", "oldest", "salary_high", "salary_low", "applicants_high", "applicants_low", "relevant"])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ===========================
// Application Schemas
// ===========================

export const createApplicationSchema = z.object({
  jobId: z.string().uuid("Invalid job ID"),
  coverLetter: z.string().min(50, "Cover letter must be at least 50 characters").max(2000),
  expectedSalary: z.number().int().min(0).optional(),
  availableFrom: dateStringSchema.optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  rejectionReason: z.string().optional(),
  interviewDate: dateStringSchema.optional(),
  interviewNotes: z.string().optional(),
});

// ===========================
// Candidate Schemas
// ===========================

export const updateCandidateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: phoneSchema,
  location: z.string().max(200).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string()).max(50).optional(),
  experience: z.number().int().min(0).max(100).optional(), // Years
  education: z.string().max(500).optional(),
  certifications: z.string().max(500).optional(),
  linkedinUrl: urlSchema,
  githubUrl: urlSchema,
  portfolioUrl: urlSchema,
  expectedSalary: z.number().int().min(0).optional(),
  availability: z.enum(["IMMEDIATE", "TWO_WEEKS", "ONE_MONTH", "NEGOTIABLE"]).optional(),
});

export const candidateSearchSchema = z.object({
  q: z.string().optional(),
  skills: z.string().optional(), // Comma-separated (ANY match)
  skillsAll: z.string().optional(), // Comma-separated (ALL match)
  location: z.string().optional(),
  experienceMin: z.coerce.number().int().min(0).optional(),
  experienceMax: z.coerce.number().int().max(100).optional(),
  availability: z.string().optional(),
  testTier: z.string().optional(),
  testScoreMin: z.coerce.number().int().min(0).max(100).optional(),
  testScoreMax: z.coerce.number().int().min(0).max(100).optional(),
  testPercentileMin: z.coerce.number().int().min(0).max(100).optional(),
  expectedSalaryMin: z.coerce.number().int().min(0).optional(),
  expectedSalaryMax: z.coerce.number().int().min(0).optional(),
  sortBy: z
    .enum(["newest", "score_high", "score_low", "experience_high", "experience_low", "relevant"])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ===========================
// Employer Schemas
// ===========================

export const updateEmployerProfileSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  companyWebsite: urlSchema,
  companyDescription: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  companySize: z.string().max(50).optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  location: z.string().max(200).optional(),
});

// ===========================
// Placement Schemas
// ===========================

export const createPlacementSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  jobTitle: z.string().min(2).max(200),
  companyName: z.string().min(2).max(200),
  startDate: dateStringSchema,
  placementFee: z.number().int().min(0),
  guaranteePeriodDays: z.number().int().min(0).max(365).default(90),
});

export const updatePlacementSchema = z.object({
  status: z.nativeEnum(PlacementStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  placementFee: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

// ===========================
// Payment Schemas
// ===========================

export const createPaymentIntentSchema = z.object({
  placementId: z.string().uuid("Invalid placement ID"),
  paymentType: z.enum(["UPFRONT", "REMAINING", "FULL"]),
});

// ===========================
// Message Schemas
// ===========================

export const sendMessageSchema = z.object({
  receiverId: z.string().uuid("Invalid receiver ID"),
  subject: z.string().min(1, "Subject is required").max(200),
  content: z.string().min(1, "Message content is required").max(5000),
  applicationId: z.string().uuid().optional(),
});

export const messageSearchSchema = z.object({
  type: z.enum(["inbox", "sent"]).optional(),
  status: z.enum(["UNREAD", "READ"]).optional(),
  search: z.string().optional(),
  ...paginationSchema.shape,
});

// ===========================
// Referral Schemas
// ===========================

export const applyReferralSchema = z.object({
  referralCode: z
    .string()
    .regex(/^REF[A-Z0-9]{8}$/, "Invalid referral code format")
    .optional(),
});

// ===========================
// Admin Schemas
// ===========================

export const approveJobSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().min(10).max(500).optional(),
});

export const suspendUserSchema = z.object({
  action: z.enum(["suspend", "unsuspend"]),
  reason: z.string().min(10).max(500).optional(),
});

export const verifyTestSchema = z.object({
  action: z.enum(["verify", "reject"]),
  note: z.string().max(500).optional(),
  resetTest: z.boolean().optional(),
});

export const adminListUsersSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
  status: z.enum(["active", "suspended", "all"]).optional(),
  sortBy: z.enum(["newest", "oldest", "name", "email", "role"]).optional(),
  includeStats: z.coerce.boolean().optional(),
  ...paginationSchema.shape,
});

export const adminListJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  search: z.string().optional(),
  employerId: z.string().uuid().optional(),
  sortBy: z.enum(["newest", "oldest", "title", "status"]).optional(),
  ...paginationSchema.shape,
});

// ===========================
// Test Schemas
// ===========================

export const submitTestSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    })
  ),
  completionTime: z.number().int().min(0), // Seconds
});

// ===========================
// Helper Functions
// ===========================

/**
 * Validate request body against schema
 * Throws ValidationError if validation fails
 */
export async function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): Promise<z.infer<T>> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};

      error.errors.forEach((err) => {
        const path = err.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(err.message);
      });

      throw new (await import("./errors")).ValidationError("Validation failed", {
        fields: fieldErrors,
      });
    }
    throw error;
  }
}

/**
 * Validate query parameters
 */
export async function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  searchParams: URLSearchParams
): Promise<z.infer<T>> {
  const data = Object.fromEntries(searchParams.entries());
  return validateRequest(schema, data);
}

/**
 * Validate URL parameters
 */
export async function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string>
): Promise<z.infer<T>> {
  return validateRequest(schema, params);
}

export default {
  // Common
  paginationSchema,
  idSchema,
  emailSchema,
  phoneSchema,
  urlSchema,
  dateStringSchema,

  // Auth
  signUpSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,

  // Jobs
  createJobSchema,
  updateJobSchema,
  jobSearchSchema,

  // Applications
  createApplicationSchema,
  updateApplicationStatusSchema,

  // Candidates
  updateCandidateProfileSchema,
  candidateSearchSchema,

  // Employers
  updateEmployerProfileSchema,

  // Placements
  createPlacementSchema,
  updatePlacementSchema,

  // Payments
  createPaymentIntentSchema,

  // Messages
  sendMessageSchema,
  messageSearchSchema,

  // Referrals
  applyReferralSchema,

  // Admin
  approveJobSchema,
  suspendUserSchema,
  verifyTestSchema,
  adminListUsersSchema,
  adminListJobsSchema,

  // Tests
  submitTestSchema,

  // Helpers
  validateRequest,
  validateQuery,
  validateParams,
};
