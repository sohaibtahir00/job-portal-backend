import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/candidates/parse-resume
 * Parse resume text using AI to extract structured data
 * Accepts plain text extracted from resume (client-side extraction)
 */
export async function POST(request: NextRequest) {
  try {
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

    const contentType = request.headers.get("content-type") || "";

    let resumeText = "";

    // Handle JSON body with pre-extracted text
    if (contentType.includes("application/json")) {
      const body = await request.json();
      resumeText = body.text || "";

      if (!resumeText || resumeText.trim().length < 50) {
        return NextResponse.json(
          { error: "Resume text is too short or empty" },
          { status: 400 }
        );
      }
    }
    // Handle FormData with file - extract text server-side using simple approach
    else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("resume") as File | null;

      if (!file) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size exceeds 5MB limit" },
          { status: 400 }
        );
      }

      // For PDF files, we'll send the raw content to GPT-4 and let it extract what it can
      // This is a simple approach that doesn't require PDF parsing libraries
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Try to extract readable text from the buffer (works for text-based PDFs)
      resumeText = extractTextFromBuffer(buffer);

      if (!resumeText || resumeText.trim().length < 50) {
        return NextResponse.json(
          { error: "Could not extract text from PDF. Please ensure the PDF contains selectable text, not scanned images." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid content type. Send JSON with text field or FormData with resume file." },
        { status: 400 }
      );
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Parse resume using GPT-4
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a resume parser. Extract structured data from the resume text.
Return a JSON object with these exact fields (use null for missing string values, empty array for missing arrays):

{
  "name": "Full name",
  "phone": "Phone number or null",
  "location": "City, State/Country or null",
  "bio": "Professional summary/objective or null",
  "currentRole": "Most recent job title or null",
  "experience": number (years of experience, calculate from work history),
  "skills": ["skill1", "skill2", ...],
  "linkedIn": "LinkedIn URL or null",
  "github": "GitHub URL or null",
  "personalWebsite": "Personal website URL or null",
  "portfolio": "Portfolio URL or null",
  "workExperience": [
    {
      "companyName": "Company name",
      "jobTitle": "Job title",
      "startDate": "YYYY-MM-DD format",
      "endDate": "YYYY-MM-DD format or null if current",
      "isCurrent": true/false,
      "description": "Job description or null",
      "location": "Work location or null"
    }
  ],
  "education": [
    {
      "schoolName": "School/University name",
      "degree": "Degree type (e.g., Bachelor of Science)",
      "fieldOfStudy": "Major/Field of study",
      "graduationYear": number (YYYY format),
      "gpa": number or null
    }
  ]
}

Important:
- For experience (years), calculate based on work history dates
- For workExperience dates, use YYYY-MM-DD format
- Set isCurrent to true if the job has no end date or says "Present"
- Return only valid JSON, no explanations or markdown`
        },
        {
          role: "user",
          content: `Parse this resume and extract structured data:\n\n${resumeText.substring(0, 12000)}`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to parse resume" },
        { status: 500 }
      );
    }

    const parsedData = JSON.parse(content);

    return NextResponse.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    console.error("Resume parse error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: "Failed to parse resume" },
      { status: 500 }
    );
  }
}

/**
 * Simple text extraction from PDF buffer
 * This extracts readable ASCII text from PDF without using external libraries
 */
function extractTextFromBuffer(buffer: Buffer): string {
  const text: string[] = [];
  const content = buffer.toString("binary");

  // Look for text streams in PDF
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;

  while ((match = streamRegex.exec(content)) !== null) {
    const streamContent = match[1];
    // Extract readable text (letters, numbers, spaces, punctuation)
    const readable = streamContent
      .replace(/[^\x20-\x7E\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (readable.length > 10) {
      text.push(readable);
    }
  }

  // Also look for text objects (Tj, TJ operators)
  const textRegex = /\(([^)]+)\)\s*Tj/g;
  while ((match = textRegex.exec(content)) !== null) {
    const readable = match[1]
      .replace(/[^\x20-\x7E]/g, "")
      .trim();
    if (readable.length > 0) {
      text.push(readable);
    }
  }

  // Look for array text objects
  const arrayTextRegex = /\[((?:\([^)]*\)[^)]*)+)\]\s*TJ/gi;
  while ((match = arrayTextRegex.exec(content)) !== null) {
    const parts = match[1].match(/\(([^)]*)\)/g);
    if (parts) {
      const readable = parts
        .map(p => p.slice(1, -1))
        .join("")
        .replace(/[^\x20-\x7E]/g, "")
        .trim();
      if (readable.length > 0) {
        text.push(readable);
      }
    }
  }

  return text.join(" ").replace(/\s+/g, " ").trim();
}
