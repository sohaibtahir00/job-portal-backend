import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "./prisma";

// Re-export authOptions for other modules to use
export { authOptions };

/**
 * Get the current authenticated user session
 * Use this in Server Components and API routes
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current authenticated user
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      image: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return !!session?.user;
}

/**
 * Check if user has a specific role
 */
export async function hasRole(role: UserRole): Promise<boolean> {
  const session = await getSession();
  return session?.user?.role === role;
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const session = await getSession();
  return roles.includes(session?.user?.role as UserRole);
}

/**
 * Check if user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole(UserRole.ADMIN);
}

/**
 * Check if user is an employer
 */
export async function isEmployer(): Promise<boolean> {
  return await hasRole(UserRole.EMPLOYER);
}

/**
 * Check if user is a candidate
 */
export async function isCandidate(): Promise<boolean> {
  return await hasRole(UserRole.CANDIDATE);
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized - Authentication required");
  }

  return session;
}

/**
 * Require specific role - throws error if user doesn't have the role
 */
export async function requireRole(role: UserRole) {
  const session = await requireAuth();

  if (session.user.role !== role) {
    throw new Error(`Forbidden - ${role} role required`);
  }

  return session;
}

/**
 * Require any of the specified roles
 */
export async function requireAnyRole(roles: UserRole[]) {
  const session = await requireAuth();

  if (!roles.includes(session.user.role as UserRole)) {
    throw new Error(`Forbidden - One of the following roles required: ${roles.join(", ")}`);
  }

  return session;
}

/**
 * Require admin role
 */
export async function requireAdmin() {
  return await requireRole(UserRole.ADMIN);
}

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, 12);
}

/**
 * Validate password strength
 * Password must be at least 8 characters with uppercase, lowercase, and number
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
