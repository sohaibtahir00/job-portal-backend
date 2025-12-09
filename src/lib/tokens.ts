import crypto from "crypto";

/**
 * Generate a secure random token for introduction responses
 * Uses URL-safe base64 encoding with 32 bytes of randomness
 */
export function generateIntroductionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate token expiry date
 * @param days Number of days until expiry (default: 7 days)
 */
export function generateTokenExpiry(days: number = 7): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiryDate: Date | null | undefined): boolean {
  if (!expiryDate) return true;
  return new Date() > new Date(expiryDate);
}

/**
 * Generate the response URL for a candidate
 */
export function generateResponseUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/introductions/respond/${token}`;
}
