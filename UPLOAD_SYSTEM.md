# File Upload System Documentation

Complete documentation for the file upload system supporting resumes, company logos, and profile images.

## Table of Contents

1. [Overview](#overview)
2. [Storage Options](#storage-options)
3. [File Upload Utilities](#file-upload-utilities)
4. [API Endpoints](#api-endpoints)
5. [Configuration](#configuration)
6. [Client Integration](#client-integration)
7. [Security](#security)

---

## Overview

The file upload system provides secure file uploads with validation, multiple storage backends, and automatic database updates.

### Features

✅ **Multiple Storage Backends**
- Local filesystem (Railway volumes)
- Cloudflare R2 (S3-compatible)

✅ **File Type Validation**
- Resume: PDF, DOC, DOCX
- Logo: PNG, JPG, JPEG, WEBP
- Profile Image: PNG, JPG, JPEG, WEBP

✅ **Size Limits**
- Resume: 5MB max
- Logo: 2MB max
- Profile Image: 1MB max

✅ **Security**
- Authenticated endpoints
- Role-based access control
- Filename sanitization
- Path traversal prevention
- Automatic old file deletion

✅ **Database Integration**
- Automatic profile updates
- Old file cleanup
- Secure URL storage

---

## Storage Options

### Local Storage (Railway Volumes)

Default storage method for Railway deployments.

**Configuration**:
```env
STORAGE_TYPE=local
UPLOAD_BASE_PATH=./public/uploads
UPLOAD_BASE_URL=/uploads
```

**Directory Structure**:
```
public/uploads/
├── resumes/
│   ├── 1705123456789-a1b2c3d4.pdf
│   └── 1705123457890-e5f6g7h8.pdf
├── logos/
│   ├── 1705123458901-i9j0k1l2.png
│   └── 1705123459012-m3n4o5p6.jpg
└── profiles/
    ├── 1705123460123-q7r8s9t0.jpg
    └── 1705123461234-u1v2w3x4.png
```

**Advantages**:
- No external dependencies
- Fast local access
- No additional costs
- Simple setup

**Considerations**:
- Files stored on server volume
- Ensure volume persistence in Railway
- Consider backup strategy

---

### Cloudflare R2 Storage

S3-compatible object storage from Cloudflare.

**Configuration**:
```env
STORAGE_TYPE=r2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=job-portal-uploads
R2_PUBLIC_URL=https://uploads.yourdomain.com
```

**Setup Steps**:

1. Create R2 bucket in Cloudflare dashboard
2. Generate API tokens (Access Key ID and Secret)
3. Configure custom domain (optional)
4. Set environment variables
5. Install AWS SDK: `npm install @aws-sdk/client-s3`

**Advantages**:
- Unlimited scalability
- CDN integration
- No egress fees
- Geographic distribution
- Automatic backups

**Considerations**:
- Requires Cloudflare account
- Additional package dependency
- API rate limits

---

## File Upload Utilities

Located in `src/lib/upload.ts`.

### Core Functions

#### `uploadResume(file: File): Promise<UploadResult>`

Upload and validate resume file.

```typescript
import { uploadResume } from '@/lib/upload';

const result = await uploadResume(file);
if (result.success) {
  console.log('Uploaded to:', result.url);
}
```

#### `uploadLogo(file: File): Promise<UploadResult>`

Upload and validate company logo.

```typescript
import { uploadLogo } from '@/lib/upload';

const result = await uploadLogo(file);
if (result.success) {
  console.log('Logo URL:', result.url);
}
```

#### `uploadProfileImage(file: File): Promise<UploadResult>`

Upload and validate profile image.

```typescript
import { uploadProfileImage } from '@/lib/upload';

const result = await uploadProfileImage(file);
```

#### `validateFile(file: File, config): FileValidationResult`

Validate file type and size before upload.

```typescript
import { validateFile, UPLOAD_CONFIG } from '@/lib/upload';

const validation = validateFile(file, UPLOAD_CONFIG.resume);
if (!validation.valid) {
  console.error(validation.error);
}
```

#### `deleteFile(fileUrl: string): Promise<boolean>`

Delete file from storage (works with both local and R2).

```typescript
import { deleteFile } from '@/lib/upload';

await deleteFile(oldResumeUrl);
```

### Helper Functions

```typescript
// Format file size for display
formatFileSize(1048576) // Returns "1 MB"

// Get file extension
getFileExtension("resume.pdf") // Returns ".pdf"

// Check if file is image
isImageFile("logo.png") // Returns true

// Check if file is PDF
isPDFFile("resume.pdf") // Returns true

// Generate unique filename
generateUniqueFilename("resume.pdf") // Returns "1705123456789-a1b2c3d4.pdf"

// Sanitize filename
sanitizeFilename("my resume (2024).pdf") // Returns "my_resume__2024_.pdf"
```

---

## API Endpoints

### Resume Upload

**POST /api/upload/resume**

Upload candidate resume (PDF, DOC, DOCX).

**Authentication**: Required (CANDIDATE role)

**Request**:
```typescript
const formData = new FormData();
formData.append('file', resumeFile);

const response = await fetch('/api/upload/resume', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**Response** (200 OK):
```json
{
  "message": "Resume uploaded successfully",
  "resume": {
    "url": "/uploads/resumes/1705123456789-a1b2c3d4.pdf",
    "filename": "1705123456789-a1b2c3d4.pdf",
    "size": 524288,
    "sizeFormatted": "512 KB"
  },
  "candidate": {
    "id": "clx123",
    "name": "John Doe",
    "resume": "/uploads/resumes/1705123456789-a1b2c3d4.pdf"
  }
}
```

**DELETE /api/upload/resume**

Delete candidate resume.

**GET /api/upload/resume**

Get upload configuration and current resume URL.

---

### Logo Upload

**POST /api/upload/logo**

Upload company logo (PNG, JPG, JPEG, WEBP).

**Authentication**: Required (EMPLOYER role)

**Request**:
```typescript
const formData = new FormData();
formData.append('file', logoFile);

const response = await fetch('/api/upload/logo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**Response** (200 OK):
```json
{
  "message": "Company logo uploaded successfully",
  "logo": {
    "url": "/uploads/logos/1705123456789-e5f6g7h8.png",
    "filename": "1705123456789-e5f6g7h8.png",
    "size": 102400,
    "sizeFormatted": "100 KB"
  },
  "employer": {
    "id": "emp123",
    "companyName": "Tech Corp",
    "companyLogo": "/uploads/logos/1705123456789-e5f6g7h8.png"
  }
}
```

**DELETE /api/upload/logo**

Delete company logo.

**GET /api/upload/logo**

Get upload configuration and current logo URL.

---

### Profile Image Upload

**POST /api/upload/profile**

Upload user profile image (PNG, JPG, JPEG, WEBP).

**Authentication**: Required (any role)

**Request**:
```typescript
const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch('/api/upload/profile', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**Response** (200 OK):
```json
{
  "message": "Profile image uploaded successfully",
  "image": {
    "url": "/uploads/profiles/1705123456789-i9j0k1l2.jpg",
    "filename": "1705123456789-i9j0k1l2.jpg",
    "size": 81920,
    "sizeFormatted": "80 KB"
  },
  "user": {
    "id": "user123",
    "name": "John Doe",
    "email": "john@example.com",
    "image": "/uploads/profiles/1705123456789-i9j0k1l2.jpg",
    "role": "CANDIDATE"
  }
}
```

**DELETE /api/upload/profile**

Delete profile image.

**GET /api/upload/profile**

Get upload configuration and current profile image URL.

---

## Configuration

### Environment Variables

```env
# Storage Configuration
STORAGE_TYPE=local                    # "local" or "r2"
UPLOAD_BASE_PATH=./public/uploads    # Local storage path
UPLOAD_BASE_URL=/uploads              # Public URL prefix

# Cloudflare R2 Configuration (if using R2)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=job-portal-uploads
R2_PUBLIC_URL=https://uploads.yourdomain.com
```

### File Type Limits

Configured in `src/lib/upload.ts`:

```typescript
export const UPLOAD_CONFIG = {
  resume: {
    allowedMimeTypes: ["application/pdf", "application/msword", "..."],
    allowedExtensions: [".pdf", ".doc", ".docx"],
    maxSizeBytes: 5 * 1024 * 1024,  // 5MB
    directory: "resumes",
  },
  logo: {
    allowedMimeTypes: ["image/png", "image/jpeg", "..."],
    allowedExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    maxSizeBytes: 2 * 1024 * 1024,  // 2MB
    directory: "logos",
  },
  profileImage: {
    allowedMimeTypes: ["image/png", "image/jpeg", "..."],
    allowedExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    maxSizeBytes: 1 * 1024 * 1024,  // 1MB
    directory: "profiles",
  },
};
```

---

## Client Integration

### React Component Example

```typescript
import { useState } from 'react';

function ResumeUpload() {
  const [uploading, setUploading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (client-side)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be under 5MB');
      return;
    }

    // Validate file type (client-side)
    const allowedTypes = ['application/pdf', 'application/msword',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only PDF, DOC, and DOCX files are allowed');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/resume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResumeUrl(data.resume.url);
        alert('Resume uploaded successfully!');
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading...</p>}
      {resumeUrl && (
        <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
          View Resume
        </a>
      )}
    </div>
  );
}
```

### Drag and Drop Example

```typescript
function DragDropUpload() {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Upload logic here...
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        border: isDragging ? '2px dashed blue' : '2px dashed gray',
        padding: '40px',
        textAlign: 'center'
      }}
    >
      Drop file here or click to upload
    </div>
  );
}
```

---

## Security

### Implemented Security Measures

✅ **Authentication Required**: All upload endpoints require valid JWT token

✅ **Role-Based Access**:
- Resume upload: CANDIDATE only
- Logo upload: EMPLOYER only
- Profile image: Any authenticated user

✅ **File Type Validation**: Both MIME type and extension checked

✅ **Size Limits**: Enforced server-side (5MB/2MB/1MB)

✅ **Filename Sanitization**: Removes dangerous characters

✅ **Path Traversal Prevention**: Sanitizes paths to prevent directory traversal

✅ **Unique Filenames**: Timestamp + random hash prevents collisions

✅ **Old File Cleanup**: Automatically deletes old files on new upload

✅ **Database Consistency**: Updates database atomically with file upload

### Best Practices

1. **Always validate on both client and server**
   - Client: Quick feedback, better UX
   - Server: Security enforcement

2. **Use FormData for file uploads**
   ```typescript
   const formData = new FormData();
   formData.append('file', file);
   ```

3. **Handle errors gracefully**
   ```typescript
   try {
     const result = await uploadResume(file);
   } catch (error) {
     // Show user-friendly error
   }
   ```

4. **Show upload progress** (optional)
   ```typescript
   const xhr = new XMLHttpRequest();
   xhr.upload.onprogress = (e) => {
     const percent = (e.loaded / e.total) * 100;
     setProgress(percent);
   };
   ```

5. **Compress images before upload** (optional)
   - Use browser-image-compression library
   - Reduces upload time and storage

---

## Error Handling

### Common Errors

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| No file provided | 400 | Empty form data | Ensure file is attached |
| File too large | 400 | Exceeds size limit | Compress or use smaller file |
| Invalid file type | 400 | Wrong MIME/extension | Use allowed file types |
| Authentication required | 401 | No token | Include Authorization header |
| Forbidden | 403 | Wrong role | Use correct role account |
| Upload failed | 500 | Storage error | Check storage configuration |

### Error Response Format

```json
{
  "error": "Failed to upload resume",
  "details": "File size exceeds 5MB limit"
}
```

---

## Testing

### Manual Testing

```bash
# Upload resume
curl -X POST http://localhost:3000/api/upload/resume \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/resume.pdf"

# Upload logo
curl -X POST http://localhost:3000/api/upload/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/logo.png"

# Delete resume
curl -X DELETE http://localhost:3000/api/upload/resume \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get configuration
curl http://localhost:3000/api/upload/resume
```

### Automated Testing

```typescript
describe('File Upload', () => {
  test('should upload valid resume', async () => {
    const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload/resume', {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.resume.url).toBeDefined();
  });

  test('should reject oversized file', async () => {
    const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf'
    });
    const formData = new FormData();
    formData.append('file', largeFile);

    const response = await fetch('/api/upload/resume', {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(400);
  });
});
```

---

## Deployment

### Railway Deployment

1. **Ensure volume is configured**:
   ```
   Railway Dashboard → Service → Settings → Volumes
   Mount Path: /app/public/uploads
   ```

2. **Set environment variables**:
   ```
   STORAGE_TYPE=local
   UPLOAD_BASE_PATH=/app/public/uploads
   UPLOAD_BASE_URL=/uploads
   ```

3. **Verify directories exist** in build:
   ```bash
   mkdir -p public/uploads/resumes public/uploads/logos public/uploads/profiles
   ```

### Cloudflare R2 Deployment

1. **Create R2 bucket**: Cloudflare Dashboard → R2

2. **Generate API tokens**: R2 → Manage R2 API Tokens

3. **Set environment variables**:
   ```
   STORAGE_TYPE=r2
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=job-portal-uploads
   ```

4. **Install AWS SDK**:
   ```bash
   npm install @aws-sdk/client-s3
   ```

5. **Configure CORS** (if needed):
   ```json
   [
     {
       "AllowedOrigins": ["https://yourdomain.com"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedHeaders": ["*"]
     }
   ]
   ```

---

## Maintenance

### Cleanup Old Files

```typescript
// Manual cleanup script (run periodically)
import { prisma } from '@/lib/prisma';
import { deleteFile } from '@/lib/upload';

async function cleanupOrphanedFiles() {
  // Find files that are no longer referenced in database
  // Delete them from storage
}
```

### Monitor Storage Usage

```typescript
// Get storage statistics
import { readdirSync, statSync } from 'fs';
import path from 'path';

function getStorageStats() {
  const uploadsDir = './public/uploads';
  let totalSize = 0;
  let fileCount = 0;

  // Calculate total size and count
  // ...

  return { totalSize, fileCount };
}
```

---

*Last Updated: January 2025*
