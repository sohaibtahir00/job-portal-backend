import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health
 * Health check endpoint for monitoring and deployment verification
 *
 * Checks:
 * - API server is running
 * - Database connection is working
 * - Environment variables are set
 *
 * Returns:
 * - 200: All systems operational
 * - 503: One or more systems failing
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const checks: Record<string, { status: "ok" | "error"; message?: string; latency?: number }> =
      {};

    // Check database connection
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;

      checks.database = {
        status: "ok",
        latency: dbLatency,
      };
    } catch (dbError) {
      checks.database = {
        status: "error",
        message: dbError instanceof Error ? dbError.message : "Database connection failed",
      };
    }

    // Check required environment variables
    const requiredEnvVars = [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "NEXTAUTH_URL",
      "EMAIL_FROM",
      "RESEND_API_KEY",
    ];

    const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

    checks.environment = {
      status: missingEnvVars.length === 0 ? "ok" : "error",
      ...(missingEnvVars.length > 0 && {
        message: `Missing environment variables: ${missingEnvVars.join(", ")}`,
      }),
    };

    // Check email service (optional)
    checks.email = {
      status: process.env.RESEND_API_KEY ? "ok" : "error",
      message: process.env.RESEND_API_KEY
        ? undefined
        : "RESEND_API_KEY not configured",
    };

    // Check payment service (optional)
    checks.stripe = {
      status: process.env.STRIPE_SECRET_KEY ? "ok" : "error",
      message: process.env.STRIPE_SECRET_KEY
        ? undefined
        : "STRIPE_SECRET_KEY not configured (optional)",
    };

    // Determine overall status
    const hasErrors = Object.values(checks).some((check) => check.status === "error");
    const overallStatus = hasErrors ? "degraded" : "healthy";
    const statusCode = hasErrors ? 503 : 200;

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      checks,
      responseTime: Date.now() - startTime,
    };

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    console.error("Health check error:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime: Date.now() - startTime,
      },
      { status: 503 }
    );
  }
}
