/**
 * Example API Route with New Validation & Error Handling System
 *
 * This file demonstrates how to use the new:
 * - Custom error classes
 * - Zod validation schemas
 * - Middleware (auth, rate limiting, validation)
 * - Consistent error responses
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, withValidation, withRateLimit } from "@/lib/middleware";
import { publicApiRateLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { ValidationError, NotFoundError } from "@/lib/errors";

// Define validation schema
const createExampleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  age: z.number().int().min(18, "Must be at least 18 years old").max(120),
  tags: z.array(z.string()).min(1).max(10).optional(),
});

/**
 * POST /api/example
 * Example endpoint with validation and rate limiting
 */
export const POST = createApiHandler(
  async (request: NextRequest, context: any) => {
    // Access validated data from context (set by withValidation middleware)
    const validatedData = context.validatedData;

    // Simulate processing
    console.log("Processing validated data:", validatedData);

    // Example: throw custom errors
    if (validatedData.name === "forbidden") {
      throw new ValidationError("This name is not allowed", {
        field: "name",
        reason: "Name is in blocklist",
      });
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: "Data validated and processed successfully",
      data: validatedData,
    });
  },
  // Apply middleware in order
  withRateLimit(publicApiRateLimiter), // Rate limit by IP
  withValidation(createExampleSchema) // Validate request body
);

/**
 * GET /api/example
 * Example endpoint with query validation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      throw new ValidationError("ID is required", {
        field: "id",
        provided: null,
      });
    }

    // Simulate database lookup
    const found = id === "123";

    if (!found) {
      throw new NotFoundError("Resource", {
        id,
        type: "example",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        name: "Example Resource",
        createdAt: new Date(),
      },
    });
  } catch (error) {
    // Errors are automatically handled by the error handling system
    throw error;
  }
}
