import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/candidates/parse-resume
 * Parse resume text using AI to extract structured data
 * Accepts JSON with pre-extracted text from client-side PDF.js parsing
 */
export async function POST(request: NextRequest) {
  try {
    await requireAnyRole([UserRole.CANDIDATE, UserRole.ADMIN]);

    // Parse JSON body with pre-extracted text
    const body = await request.json();
    const resumeText = body.text || "";

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        { error: "Resume text is too short or empty. Please ensure the PDF contains selectable text." },
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
