/**
 * Rate Limiting Implementation
 *
 * In-memory rate limiting for API endpoints
 * Uses sliding window algorithm for accurate rate limiting
 *
 * For production with multiple instances, consider:
 * - Redis-based rate limiting (upstash/ratelimit)
 * - Cloudflare rate limiting
 * - Vercel Edge Config
 */

import { RateLimitError } from "./errors";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string; // Custom error message
  keyGenerator?: (identifier: string) => string; // Custom key generator
  skip?: (identifier: string) => boolean; // Skip rate limiting for certain identifiers
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory store for rate limit data
 * Maps identifier -> RateLimitEntry
 */
class RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, value: RateLimitEntry): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private store: RateLimitStore;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      message: config.message || "Too many requests. Please try again later.",
      keyGenerator: config.keyGenerator || ((id) => id),
      skip: config.skip || (() => false),
    };
    this.store = new RateLimitStore();
  }

  /**
   * Check rate limit for identifier
   * Throws RateLimitError if limit exceeded
   */
  async check(identifier: string): Promise<void> {
    // Skip rate limiting if configured
    if (this.config.skip(identifier)) {
      return;
    }

    const key = this.config.keyGenerator(identifier);
    const now = Date.now();

    const entry = this.store.get(key);

    if (!entry) {
      // First request in window
      this.store.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return;
    }

    // Check if window has expired
    if (entry.resetTime < now) {
      // Reset window
      this.store.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return;
    }

    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      throw new RateLimitError(this.config.message, {
        limit: this.config.maxRequests,
        windowMs: this.config.windowMs,
        retryAfter,
        resetTime: new Date(entry.resetTime).toISOString(),
      });
    }

    // Increment count
    entry.count++;
    this.store.set(key, entry);
  }

  /**
   * Get rate limit info for identifier
   */
  getInfo(identifier: string): {
    remaining: number;
    resetTime: Date;
    limit: number;
  } | null {
    const key = this.config.keyGenerator(identifier);
    const entry = this.store.get(key);

    if (!entry) {
      return {
        remaining: this.config.maxRequests,
        resetTime: new Date(Date.now() + this.config.windowMs),
        limit: this.config.maxRequests,
      };
    }

    const now = Date.now();
    if (entry.resetTime < now) {
      return {
        remaining: this.config.maxRequests,
        resetTime: new Date(now + this.config.windowMs),
        limit: this.config.maxRequests,
      };
    }

    return {
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: new Date(entry.resetTime),
      limit: this.config.maxRequests,
    };
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier: string): void {
    const key = this.config.keyGenerator(identifier);
    this.store.delete(key);
  }

  /**
   * Destroy rate limiter and cleanup
   */
  destroy(): void {
    this.store.destroy();
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */

// Strict rate limit for authentication endpoints
export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 requests per 15 minutes
  message: "Too many authentication attempts. Please try again in 15 minutes.",
});

// Moderate rate limit for public API endpoints
export const publicApiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  message: "Too many requests. Please try again in a minute.",
});

// Lenient rate limit for authenticated users
export const authenticatedRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: "Too many requests. Please slow down.",
});

// Strict rate limit for expensive operations
export const expensiveOperationRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 requests per hour
  message: "This operation is rate limited. Please try again later.",
});

// Rate limit for file uploads
export const uploadRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // 20 uploads per hour
  message: "Too many file uploads. Please try again later.",
});

// Rate limit for sending emails
export const emailRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 emails per hour
  message: "Too many emails sent. Please try again later.",
});

/**
 * Get identifier from request
 * Uses IP address as fallback
 */
export function getIdentifier(request: Request, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Get IP from headers (works with most proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip =
    forwarded?.split(",")[0].trim() || realIp || request.headers.get("cf-connecting-ip") || "unknown";

  return `ip:${ip}`;
}

/**
 * Rate limit middleware helper
 * Returns rate limit headers
 */
export function getRateLimitHeaders(info: {
  remaining: number;
  resetTime: Date;
  limit: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": info.limit.toString(),
    "X-RateLimit-Remaining": info.remaining.toString(),
    "X-RateLimit-Reset": info.resetTime.toISOString(),
  };
}

/**
 * Apply rate limit to request
 * Returns headers to include in response
 */
export async function applyRateLimit(
  rateLimiter: RateLimiter,
  identifier: string
): Promise<Record<string, string>> {
  await rateLimiter.check(identifier);
  const info = rateLimiter.getInfo(identifier);
  return info ? getRateLimitHeaders(info) : {};
}

export default {
  RateLimiter,
  authRateLimiter,
  publicApiRateLimiter,
  authenticatedRateLimiter,
  expensiveOperationRateLimiter,
  uploadRateLimiter,
  emailRateLimiter,
  getIdentifier,
  getRateLimitHeaders,
  applyRateLimit,
};
