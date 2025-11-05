import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * POST /api/candidates/resume
 * Upload resume file
 * Requires CANDIDATE or ADMIN role
 *
 * This endpoint handles file uploads and stores the resume.
 * In production, you should use a cloud storage service like S3, Cloudinary, or Vercel Blob.
 */
export async function POST(request: NextRequest) {
  try {
    // Require candidate or admin role
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if profile exists
    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate profile not found. Please create your profile first." },
        { status: 404 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("resume") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type (PDF, DOC, DOCX)
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: "Invalid file type. Only PDF, DOC, and DOCX files are allowed.",
          allowedTypes: ["PDF", "DOC", "DOCX"],
        },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: "File too large. Maximum file size is 5MB.",
          maxSize: "5MB",
          fileSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop();
    const filename = `resume_${user.id}_${timestamp}.${fileExtension}`;

    // In production, upload to S3/Cloudinary/Vercel Blob
    // For now, we'll store locally in /public/uploads/resumes
    const uploadDir = join(process.cwd(), "public", "uploads", "resumes");

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
    const resumeUrl = `/uploads/resumes/${filename}`;

    // Update candidate profile with resume URL
    const updatedCandidate = await prisma.candidate.update({
      where: { userId: user.id },
      data: {
        resume: resumeUrl,
      },
      select: {
        id: true,
        resume: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Resume uploaded successfully",
      resumeUrl,
      candidate: updatedCandidate,
    });
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
          { error: "Insufficient permissions. Candidate role required." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to upload resume" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/candidates/resume
 * Delete resume file
 * Requires CANDIDATE or ADMIN role
 */
export async function DELETE() {
  try {
    // Require candidate or admin role
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Update candidate profile to remove resume
    const updatedCandidate = await prisma.candidate.update({
      where: { userId: user.id },
      data: {
        resume: null,
      },
      select: {
        id: true,
        resume: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Resume removed successfully",
      candidate: updatedCandidate,
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
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete resume" },
      { status: 500 }
    );
  }
}
