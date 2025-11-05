import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  uploadLogo,
  deleteFile,
  formatFileSize,
  UPLOAD_CONFIG,
} from "@/lib/upload";

/**
 * POST /api/upload/logo
 * Upload company logo
 *
 * Requirements:
 * - Authenticated user with EMPLOYER role
 * - File must be PNG, JPG, JPEG, or WEBP
 * - File size must be under 2MB
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: FormData with "file" field
 *
 * Response:
 * - 200: { url, filename, size }
 * - 400: Validation error
 * - 401: Not authenticated
 * - 403: Not an employer
 * - 500: Upload error
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer role
    await requireRole(UserRole.EMPLOYER);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Upload logo using utility function
    const uploadResult = await uploadLogo(file);

    if (!uploadResult.success) {
      return NextResponse.json(
        {
          error: "Failed to upload logo",
          details: uploadResult.error,
        },
        { status: 400 }
      );
    }

    // Delete old logo if exists
    if (employer.companyLogo) {
      try {
        await deleteFile(employer.companyLogo);
      } catch (error) {
        console.error("Failed to delete old logo:", error);
        // Don't fail the upload if old file deletion fails
      }
    }

    // Update employer profile with new logo URL
    const updatedEmployer = await prisma.employer.update({
      where: { id: employer.id },
      data: {
        companyLogo: uploadResult.url,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Company logo uploaded successfully",
        logo: {
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size,
          sizeFormatted: formatFileSize(uploadResult.size || 0),
        },
        employer: {
          id: updatedEmployer.id,
          companyName: updatedEmployer.companyName,
          companyLogo: updatedEmployer.companyLogo,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Logo upload error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to upload logo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload/logo
 * Delete company logo
 *
 * Requirements:
 * - Authenticated user with EMPLOYER role
 *
 * Response:
 * - 200: Logo deleted successfully
 * - 401: Not authenticated
 * - 403: Not an employer
 * - 404: No logo found
 * - 500: Deletion error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Require employer role
    await requireRole(UserRole.EMPLOYER);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get employer profile
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    if (!employer.companyLogo) {
      return NextResponse.json(
        { error: "No logo found" },
        { status: 404 }
      );
    }

    // Delete file from storage
    try {
      await deleteFile(employer.companyLogo);
    } catch (error) {
      console.error("Failed to delete logo file:", error);
      // Continue to update database even if file deletion fails
    }

    // Update employer profile to remove logo URL
    await prisma.employer.update({
      where: { id: employer.id },
      data: {
        companyLogo: null,
      },
    });

    return NextResponse.json({
      message: "Company logo deleted successfully",
    });
  } catch (error) {
    console.error("Logo deletion error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to delete logo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload/logo
 * Get upload configuration and limits
 *
 * Returns:
 * - Allowed file types
 * - Max file size
 * - Current logo URL (if authenticated)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    let currentLogo = null;

    if (user && user.role === UserRole.EMPLOYER) {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { companyLogo: true },
      });
      currentLogo = employer?.companyLogo || null;
    }

    return NextResponse.json({
      config: {
        allowedTypes: UPLOAD_CONFIG.logo.allowedExtensions,
        allowedMimeTypes: UPLOAD_CONFIG.logo.allowedMimeTypes,
        maxSizeMB: UPLOAD_CONFIG.logo.maxSizeMB,
        maxSizeBytes: UPLOAD_CONFIG.logo.maxSizeBytes,
      },
      currentLogo,
    });
  } catch (error) {
    console.error("Get logo config error:", error);

    return NextResponse.json(
      {
        error: "Failed to get configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
