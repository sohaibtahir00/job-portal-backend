import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * POST /api/employers/logo
 * Upload company logo
 * Requires EMPLOYER or ADMIN role
 *
 * Accepts image files (PNG, JPG, JPEG, GIF, WebP)
 * Max size: 2MB
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if employer profile exists
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type (images only)
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: "Invalid file type. Only PNG, JPG, GIF, and WebP images are allowed.",
          allowedTypes: ["PNG", "JPG", "JPEG", "GIF", "WebP"],
        },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: "File too large. Maximum file size is 2MB.",
          maxSize: "2MB",
          fileSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop();
    const filename = `logo_${employer.id}_${timestamp}.${fileExtension}`;

    // In production, upload to S3/Cloudinary/Vercel Blob
    // For now, we'll store locally in /public/uploads/logos
    const uploadDir = join(process.cwd(), "public", "uploads", "logos");

    // Create upload directory if it doesn't exist
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Convert file to buffer and write to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filepath = join(uploadDir, filename);

    await writeFile(filepath, buffer);

    // Store the URL in database
    const logoUrl = `/uploads/logos/${filename}`;

    // Update employer profile with logo URL
    const updatedEmployer = await prisma.employer.update({
      where: { userId: user.id },
      data: {
        companyLogo: logoUrl,
      },
      select: {
        id: true,
        companyName: true,
        companyLogo: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Company logo uploaded successfully",
      logoUrl,
      employer: updatedEmployer,
    });
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
          { error: "Insufficient permissions. Employer role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to upload logo" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/employers/logo
 * Delete company logo
 * Requires EMPLOYER or ADMIN role
 */
export async function DELETE() {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Update employer profile to remove logo
    const updatedEmployer = await prisma.employer.update({
      where: { userId: user.id },
      data: {
        companyLogo: null,
      },
      select: {
        id: true,
        companyName: true,
        companyLogo: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Company logo removed successfully",
      employer: updatedEmployer,
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
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    );
  }
}
