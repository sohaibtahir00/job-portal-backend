/**
 * File Upload Utilities
 *
 * Provides utilities for file upload handling, validation, and storage
 * Supports local filesystem storage (Railway volumes) and Cloudflare R2
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

// File upload configuration
export const UPLOAD_CONFIG = {
  // Storage type: "local" for Railway volumes, "r2" for Cloudflare R2
  storageType: (process.env.STORAGE_TYPE || "local") as "local" | "r2",

  // Local storage paths (for Railway volumes)
  localBasePath: process.env.UPLOAD_BASE_PATH || "./public/uploads",
  localBaseUrl: process.env.UPLOAD_BASE_URL || "/uploads",

  // Cloudflare R2 configuration
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET_NAME || "job-portal-uploads",
    publicUrl: process.env.R2_PUBLIC_URL || "",
  },

  // File type configurations
  resume: {
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    allowedExtensions: [".pdf", ".doc", ".docx"],
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    maxSizeMB: 5,
    directory: "resumes",
  },

  logo: {
    allowedMimeTypes: [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ],
    allowedExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    maxSizeMB: 2,
    directory: "logos",
  },

  profileImage: {
    allowedMimeTypes: [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ],
    allowedExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    maxSizeBytes: 1 * 1024 * 1024, // 1MB
    maxSizeMB: 1,
    directory: "profiles",
  },
} as const;

// File validation result
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// Upload result
export interface UploadResult {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

/**
 * Validate file type and size
 */
export function validateFile(
  file: File,
  config: {
    allowedMimeTypes: string[];
    allowedExtensions: string[];
    maxSizeBytes: number;
    maxSizeMB: number;
  }
): FileValidationResult {
  // Check if file exists
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  // Check file size
  if (file.size > config.maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${config.maxSizeMB}MB limit`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  // Check MIME type
  if (!config.allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${config.allowedExtensions.join(", ")}`,
    };
  }

  // Check file extension
  const extension = path.extname(file.name).toLowerCase();
  if (!config.allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed extensions: ${config.allowedExtensions.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Generate unique filename with timestamp and random hash
 */
export function generateUniqueFilename(originalFilename: string): string {
  const extension = path.extname(originalFilename);
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString("hex");
  return `${timestamp}-${randomHash}${extension}`;
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.+/g, ".")
    .substring(0, 255);
}

/**
 * Upload file to local storage (Railway volumes)
 */
export async function uploadToLocal(
  file: File,
  directory: string
): Promise<UploadResult> {
  try {
    // Convert File to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const uniqueFilename = generateUniqueFilename(file.name);
    const sanitizedFilename = sanitizeFilename(uniqueFilename);

    // Create directory path
    const dirPath = path.join(UPLOAD_CONFIG.localBasePath, directory);

    // Ensure directory exists
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // Full file path
    const filePath = path.join(dirPath, sanitizedFilename);

    // Write file to disk
    await writeFile(filePath, buffer);

    // Generate public URL
    const publicUrl = `${UPLOAD_CONFIG.localBaseUrl}/${directory}/${sanitizedFilename}`;

    return {
      success: true,
      url: publicUrl,
      filename: sanitizedFilename,
      size: file.size,
    };
  } catch (error) {
    console.error("Local upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Upload file to Cloudflare R2
 * Requires @aws-sdk/client-s3 package
 */
export async function uploadToR2(
  file: File,
  directory: string
): Promise<UploadResult> {
  try {
    // Check if R2 is configured
    if (
      !UPLOAD_CONFIG.r2.accountId ||
      !UPLOAD_CONFIG.r2.accessKeyId ||
      !UPLOAD_CONFIG.r2.secretAccessKey
    ) {
      throw new Error("Cloudflare R2 is not configured. Please set R2 environment variables.");
    }

    // Dynamic import to avoid loading AWS SDK if not needed
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${UPLOAD_CONFIG.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: UPLOAD_CONFIG.r2.accessKeyId,
        secretAccessKey: UPLOAD_CONFIG.r2.secretAccessKey,
      },
    });

    // Convert File to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const uniqueFilename = generateUniqueFilename(file.name);
    const sanitizedFilename = sanitizeFilename(uniqueFilename);

    // Object key (path in R2)
    const key = `${directory}/${sanitizedFilename}`;

    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: UPLOAD_CONFIG.r2.bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: file.size,
    });

    await s3Client.send(command);

    // Generate public URL
    const publicUrl = UPLOAD_CONFIG.r2.publicUrl
      ? `${UPLOAD_CONFIG.r2.publicUrl}/${key}`
      : `https://${UPLOAD_CONFIG.r2.bucketName}.${UPLOAD_CONFIG.r2.accountId}.r2.cloudflarestorage.com/${key}`;

    return {
      success: true,
      url: publicUrl,
      filename: sanitizedFilename,
      size: file.size,
    };
  } catch (error) {
    console.error("R2 upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Main upload function that routes to appropriate storage
 */
export async function uploadFile(
  file: File,
  directory: string
): Promise<UploadResult> {
  if (UPLOAD_CONFIG.storageType === "r2") {
    return uploadToR2(file, directory);
  } else {
    return uploadToLocal(file, directory);
  }
}

/**
 * Delete file from storage
 */
export async function deleteFile(fileUrl: string): Promise<boolean> {
  try {
    if (UPLOAD_CONFIG.storageType === "r2") {
      // Extract key from URL
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1); // Remove leading slash

      const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${UPLOAD_CONFIG.r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: UPLOAD_CONFIG.r2.accessKeyId,
          secretAccessKey: UPLOAD_CONFIG.r2.secretAccessKey,
        },
      });

      const command = new DeleteObjectCommand({
        Bucket: UPLOAD_CONFIG.r2.bucketName,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } else {
      // Local file deletion
      const { unlink } = await import("fs/promises");
      const filePath = path.join(
        process.cwd(),
        "public",
        fileUrl.replace(UPLOAD_CONFIG.localBaseUrl, "")
      );
      await unlink(filePath);
      return true;
    }
  } catch (error) {
    console.error("File deletion error:", error);
    return false;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

/**
 * Check if file is an image
 */
export function isImageFile(filename: string): boolean {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
  return imageExtensions.includes(getFileExtension(filename));
}

/**
 * Check if file is a PDF
 */
export function isPDFFile(filename: string): boolean {
  return getFileExtension(filename) === ".pdf";
}

/**
 * Validate and upload resume
 */
export async function uploadResume(file: File): Promise<UploadResult> {
  // Validate file
  const validation = validateFile(file, UPLOAD_CONFIG.resume);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Upload file
  return uploadFile(file, UPLOAD_CONFIG.resume.directory);
}

/**
 * Validate and upload company logo
 */
export async function uploadLogo(file: File): Promise<UploadResult> {
  // Validate file
  const validation = validateFile(file, UPLOAD_CONFIG.logo);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Upload file
  return uploadFile(file, UPLOAD_CONFIG.logo.directory);
}

/**
 * Validate and upload profile image
 */
export async function uploadProfileImage(file: File): Promise<UploadResult> {
  // Validate file
  const validation = validateFile(file, UPLOAD_CONFIG.profileImage);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Upload file
  return uploadFile(file, UPLOAD_CONFIG.profileImage.directory);
}

export default {
  UPLOAD_CONFIG,
  validateFile,
  generateUniqueFilename,
  sanitizeFilename,
  uploadFile,
  uploadToLocal,
  uploadToR2,
  deleteFile,
  formatFileSize,
  getFileExtension,
  isImageFile,
  isPDFFile,
  uploadResume,
  uploadLogo,
  uploadProfileImage,
};
