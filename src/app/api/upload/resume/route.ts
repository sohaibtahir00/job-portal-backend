import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  uploadResume,
  deleteFile,
  formatFileSize,
  UPLOAD_CONFIG,
} from "@/lib/upload";

/**
 * POST /api/upload/resume
 * Upload candidate resume
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 * - File must be PDF, DOC, or DOCX
 * - File size must be under 5MB
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: FormData with "file" field
 *
 * Response:
 * - 200: { url, filename, size }
 * - 400: Validation error
 * - 401: Not authenticated
 * - 403: Not a candidate
 * - 500: Upload error
 */
export async function POST(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
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

    // Upload resume using utility function
    const uploadResult = await uploadResume(file);

    if (!uploadResult.success) {
      return NextResponse.json(
        {
          error: "Failed to upload resume",
          details: uploadResult.error,
        },
        { status: 400 }
      );
    }

    // Delete old resume if exists
    if (candidate.resume) {
      try {
        await deleteFile(candidate.resume);
      } catch (error) {
        console.error("Failed to delete old resume:", error);
        // Don't fail the upload if old file deletion fails
      }
    }

    // Update candidate profile with new resume URL
    const updatedCandidate = await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resume: uploadResult.url,
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
        message: "Resume uploaded successfully",
        resume: {
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size,
          sizeFormatted: formatFileSize(uploadResult.size || 0),
        },
        candidate: {
          id: updatedCandidate.id,
          name: updatedCandidate.user.name,
          resume: updatedCandidate.resume,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Resume upload error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to upload resume",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload/resume
 * Delete candidate resume
 *
 * Requirements:
 * - Authenticated user with CANDIDATE role
 *
 * Response:
 * - 200: Resume deleted successfully
 * - 401: Not authenticated
 * - 403: Not a candidate
 * - 404: No resume found
 * - 500: Deletion error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Require candidate role
    await requireRole(UserRole.CANDIDATE);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get candidate profile
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found" },
        { status: 404 }
      );
    }

    if (!candidate.resume) {
      return NextResponse.json(
        { error: "No resume found" },
        { status: 404 }
      );
    }

    // Delete file from storage
    try {
      await deleteFile(candidate.resume);
    } catch (error) {
      console.error("Failed to delete resume file:", error);
      // Continue to update database even if file deletion fails
    }

    // Update candidate profile to remove resume URL
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resume: null,
      },
    });

    return NextResponse.json({
      message: "Resume deleted successfully",
    });
  } catch (error) {
    console.error("Resume deletion error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Candidate role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to delete resume",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload/resume
 * Get upload configuration and limits
 *
 * Returns:
 * - Allowed file types
 * - Max file size
 * - Current resume URL (if authenticated)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    let currentResume = null;

    if (user && user.role === UserRole.CANDIDATE) {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
        select: { resume: true },
      });
      currentResume = candidate?.resume || null;
    }

    return NextResponse.json({
      config: {
        allowedTypes: UPLOAD_CONFIG.resume.allowedExtensions,
        allowedMimeTypes: UPLOAD_CONFIG.resume.allowedMimeTypes,
        maxSizeMB: UPLOAD_CONFIG.resume.maxSizeMB,
        maxSizeBytes: UPLOAD_CONFIG.resume.maxSizeBytes,
      },
      currentResume,
    });
  } catch (error) {
    console.error("Get resume config error:", error);

    return NextResponse.json(
      {
        error: "Failed to get configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
