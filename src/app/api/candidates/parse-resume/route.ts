import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import OpenAI from "openai";

// Force Node.js runtime for PDF parsing
export const runtime = "nodejs";

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Dynamic imports for PDF and DOCX parsing to avoid Edge runtime issues
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * POST /api/candidates/parse-resume
 * Parse a resume file (PDF or DOCX) and extract structured data using AI
 * Requires CANDIDATE role
 */
export async function POST(request: NextRequest) {
  try {
    // Require candidate role
    await requireAnyRole([UserRole.CANDIDATE]);

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Resume parsing service is not configured. Please contact administrator." },
        { status: 500 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const file = formData.get("resume") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No resume file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith(".pdf") || file.type === "application/pdf";
    const isDOCX = fileName.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (!isPDF && !isDOCX) {
      return NextResponse.json(
        { error: "Please upload a PDF or DOCX file" },
        { status: 400 }
      );
    }

    // Extract text from the file
    let resumeText = "";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      if (isPDF) {
        resumeText = await extractTextFromPDF(buffer);
      } else if (isDOCX) {
        resumeText = await extractTextFromDOCX(buffer);
      }
    } catch (extractError) {
      console.error("Text extraction error:", extractError);
      return NextResponse.json(
        { error: "Couldn't read your resume. Please try a different file or fill in manually." },
        { status: 400 }
      );
    }

    // Validate that we got some text
    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        { error: "Couldn't extract enough text from your resume. Please try a different file or fill in manually." },
        { status: 400 }
      );
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Parse resume using GPT-4
    try {
      const parsePrompt = `Extract the following information from this resume and return as JSON only (no markdown, no explanation, no code blocks):

{
  "name": "Full name",
  "phone": "Phone number or null",
  "location": "City, State/Country or null",
  "bio": "Professional summary/objective (2-3 sentences max) or null",
  "currentRole": "Most recent job title or null",
  "experience": number of years of experience (calculate from work history, round to nearest integer),
  "skills": ["skill1", "skill2", ...] (max 20 most relevant skills),
  "linkedIn": "LinkedIn URL or null",
  "github": "GitHub URL or null",
  "personalWebsite": "Personal website URL or null",
  "portfolio": "Portfolio URL or null",
  "workExperience": [
    {
      "companyName": "Company",
      "jobTitle": "Title",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or null if current",
      "isCurrent": true/false,
      "description": "Job description (brief summary, max 200 chars) or null",
      "location": "Location or null"
    }
  ],
  "education": [
    {
      "schoolName": "School",
      "degree": "Degree type",
      "fieldOfStudy": "Major/Field",
      "graduationYear": YYYY (number),
      "gpa": number or null
    }
  ]
}

Important parsing rules:
- For dates, use YYYY-MM-DD format. If only year and month given, use the 1st of the month.
- For work experience with only years, estimate January 1st for start and December 31st for end.
- Calculate total years of experience by summing up all work experience durations.
- Skills should be technical and professional skills, not soft skills.
- Keep descriptions brief and professional.
- If graduation year is "Expected YYYY" or "Present", use that year.
- For GPA, only include if explicitly mentioned.
- Return null for any field that cannot be determined from the resume.

Resume text:
${resumeText.substring(0, 12000)}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a professional resume parser. Extract structured data from resume text accurately. Return only valid JSON, no explanations."
          },
          {
            role: "user",
            content: parsePrompt
          }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const parsedData = JSON.parse(completion.choices[0].message.content || "{}");

      // Validate and sanitize the response
      const sanitizedData = {
        name: typeof parsedData.name === "string" ? parsedData.name.trim() : null,
        phone: typeof parsedData.phone === "string" ? parsedData.phone.trim() : null,
        location: typeof parsedData.location === "string" ? parsedData.location.trim() : null,
        bio: typeof parsedData.bio === "string" ? parsedData.bio.trim().substring(0, 500) : null,
        currentRole: typeof parsedData.currentRole === "string" ? parsedData.currentRole.trim() : null,
        experience: typeof parsedData.experience === "number" ? Math.max(0, Math.round(parsedData.experience)) : 0,
        skills: Array.isArray(parsedData.skills)
          ? parsedData.skills.filter((s: any) => typeof s === "string").slice(0, 20)
          : [],
        linkedIn: typeof parsedData.linkedIn === "string" && parsedData.linkedIn.includes("linkedin.com")
          ? parsedData.linkedIn.trim()
          : null,
        github: typeof parsedData.github === "string" && parsedData.github.includes("github.com")
          ? parsedData.github.trim()
          : null,
        personalWebsite: typeof parsedData.personalWebsite === "string" && parsedData.personalWebsite.startsWith("http")
          ? parsedData.personalWebsite.trim()
          : null,
        portfolio: typeof parsedData.portfolio === "string" && parsedData.portfolio.startsWith("http")
          ? parsedData.portfolio.trim()
          : null,
        workExperience: Array.isArray(parsedData.workExperience)
          ? parsedData.workExperience.map((exp: any) => ({
              companyName: typeof exp.companyName === "string" ? exp.companyName.trim() : "Unknown Company",
              jobTitle: typeof exp.jobTitle === "string" ? exp.jobTitle.trim() : "Unknown Role",
              startDate: typeof exp.startDate === "string" ? exp.startDate : null,
              endDate: exp.isCurrent ? null : (typeof exp.endDate === "string" ? exp.endDate : null),
              isCurrent: Boolean(exp.isCurrent),
              description: typeof exp.description === "string" ? exp.description.trim().substring(0, 500) : null,
              location: typeof exp.location === "string" ? exp.location.trim() : null
            })).slice(0, 10)
          : [],
        education: Array.isArray(parsedData.education)
          ? parsedData.education.map((edu: any) => ({
              schoolName: typeof edu.schoolName === "string" ? edu.schoolName.trim() : "Unknown School",
              degree: typeof edu.degree === "string" ? edu.degree.trim() : "Unknown Degree",
              fieldOfStudy: typeof edu.fieldOfStudy === "string" ? edu.fieldOfStudy.trim() : "Unknown Field",
              graduationYear: typeof edu.graduationYear === "number" ? edu.graduationYear : new Date().getFullYear(),
              gpa: typeof edu.gpa === "number" ? edu.gpa : null
            })).slice(0, 5)
          : []
      };

      return NextResponse.json({
        success: true,
        data: sanitizedData,
        message: "Resume parsed successfully!"
      });

    } catch (aiError) {
      console.error("OpenAI parsing error:", aiError);
      return NextResponse.json(
        { error: "Failed to analyze your resume. The AI service may be unavailable. Please try again or fill in manually." },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Resume parse error:", error);

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
      { error: "Failed to process resume. Please try again." },
      { status: 500 }
    );
  }
}
