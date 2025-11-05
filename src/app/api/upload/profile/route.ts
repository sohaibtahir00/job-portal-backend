import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadProfileImage,
  deleteFile,
  formatFileSize,
  UPLOAD_CONFIG,
} from "@/lib/upload";

/**
 * POST /api/upload/profile
 * Upload user profile image
 *
 * Requirements:
 * - Authenticated user
 * - File must be PNG, JPG, JPEG, or WEBP
 * - File size must be under 1MB
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: FormData with "file" field
 *
 * Response:
 * - 200: { url, filename, size }
 * - 400: Validation error
 * - 401: Not authenticated
 * - 500: Upload error
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
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

    // Upload profile image using utility function
    const uploadResult = await uploadProfileImage(file);

    if (!uploadResult.success) {
      return NextResponse.json(
        {
          error: "Failed to upload profile image",
          details: uploadResult.error,
        },
        { status: 400 }
      );
    }

    // Delete old profile image if exists
    if (user.image) {
      try {
        await deleteFile(user.image);
      } catch (error) {
        console.error("Failed to delete old profile image:", error);
        // Don't fail the upload if old file deletion fails
      }
    }

    // Update user profile with new image URL
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        image: uploadResult.url,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });

    return NextResponse.json(
      {
        message: "Profile image uploaded successfully",
        image: {
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size,
          sizeFormatted: formatFileSize(uploadResult.size || 0),
        },
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Profile image upload error:", error);

    return NextResponse.json(
      {
        error: "Failed to upload profile image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload/profile
 * Delete user profile image
 *
 * Requirements:
 * - Authenticated user
 *
 * Response:
 * - 200: Profile image deleted successfully
 * - 401: Not authenticated
 * - 404: No profile image found
 * - 500: Deletion error
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!user.image) {
      return NextResponse.json(
        { error: "No profile image found" },
        { status: 404 }
      );
    }

    // Delete file from storage
    try {
      await deleteFile(user.image);
    } catch (error) {
      console.error("Failed to delete profile image file:", error);
      // Continue to update database even if file deletion fails
    }

    // Update user profile to remove image URL
    await prisma.user.update({
      where: { id: user.id },
      data: {
        image: null,
      },
    });

    return NextResponse.json({
      message: "Profile image deleted successfully",
    });
  } catch (error) {
    console.error("Profile image deletion error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete profile image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload/profile
 * Get upload configuration and limits
 *
 * Returns:
 * - Allowed file types
 * - Max file size
 * - Current profile image URL (if authenticated)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    let currentImage = null;

    if (user) {
      currentImage = user.image || null;
    }

    return NextResponse.json({
      config: {
        allowedTypes: UPLOAD_CONFIG.profileImage.allowedExtensions,
        allowedMimeTypes: UPLOAD_CONFIG.profileImage.allowedMimeTypes,
        maxSizeMB: UPLOAD_CONFIG.profileImage.maxSizeMB,
        maxSizeBytes: UPLOAD_CONFIG.profileImage.maxSizeBytes,
      },
      currentImage,
    });
  } catch (error) {
    console.error("Get profile image config error:", error);

    return NextResponse.json(
      {
        error: "Failed to get configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
