import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getCurrentUser, requireAuth } from "@/lib/auth";

/**
 * POST /api/upload/file
 * Upload a file (resume, photo, etc.)
 * Returns the file URL
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string; // 'resume' or 'photo'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes: Record<string, string[]> = {
      resume: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      photo: ["image/jpeg", "image/png", "image/jpg", "image/webp"],
    };

    if (fileType && allowedTypes[fileType] && !allowedTypes[fileType].includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type for ${fileType}. Allowed: ${allowedTypes[fileType].join(", ")}` },
        { status: 400 }
      );
    }

    // Validate file size (10MB for resumes, 5MB for photos)
    const maxSize = fileType === "resume" ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split(".").pop();
    const filename = `${user.id}_${timestamp}.${extension}`;

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), "public", "uploads", fileType || "files");
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Save file
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    // Return absolute URL using backend domain with /api/uploads/ route
    // This ensures the URL works when called from the frontend (different domain)
    // Using /api/uploads/ instead of /uploads/ because the API route serves files from filesystem
    const relativePath = `/api/uploads/${fileType || "files"}/${filename}`;
    const baseUrl = process.env.NEXTAUTH_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
    const fileUrl = baseUrl ? `${baseUrl}${relativePath}` : relativePath;

    return NextResponse.json({
      message: "File uploaded successfully",
      url: fileUrl,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
