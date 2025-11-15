import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import OpenAI from "openai";

/**
 * POST /api/jobs/import
 * Import job details from a URL using AI parsing
 * Requires EMPLOYER or ADMIN role
 */
export async function POST(request: NextRequest) {
  try {
    // Require employer or admin role
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: "Valid URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    let jobUrl: URL;
    try {
      jobUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please contact administrator." },
        { status: 500 }
      );
    }

    // Fetch the job posting HTML
    let htmlContent: string;
    try {
      const response = await fetch(jobUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch job posting: ${response.statusText}` },
          { status: 400 }
        );
      }

      htmlContent = await response.text();
    } catch (error) {
      console.error("Error fetching job URL:", error);
      return NextResponse.json(
        { error: "Failed to fetch job posting. Please check the URL and try again." },
        { status: 400 }
      );
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Parse job data using GPT-4
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a job posting parser. Extract structured job data from HTML content.
Return a JSON object with these exact fields (use null for missing data):

{
  "title": "string - job title",
  "nicheCategory": "string - one of: AI/ML, Fintech, Cybersecurity, Healthcare IT, Cloud Computing, DevOps, Data Science, Web Development, Mobile Development, Blockchain",
  "employmentType": "string - one of: FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP",
  "experienceLevel": "string - one of: ENTRY, MID, SENIOR, LEAD, EXECUTIVE",
  "location": "string - job location",
  "remoteType": "string - one of: REMOTE, HYBRID, ON_SITE",
  "description": "string - full job description",
  "keyResponsibilities": ["array of strings - main responsibilities"],
  "skills": ["array of strings - required skills"],
  "niceToHaveSkills": ["array of strings - nice-to-have skills"],
  "techStack": ["array of strings - technologies used"],
  "salaryMin": number - minimum salary (0 if not specified),
  "salaryMax": number - maximum salary (0 if not specified),
  "isCompetitive": boolean - true if salary is "competitive" or not disclosed,
  "equityOffered": boolean - true if equity/stock options mentioned,
  "specificBenefits": ["array of strings - specific benefits mentioned"],
  "hiringTimeline": "string - expected hiring timeline",
  "deadline": "string - application deadline in ISO format (null if not specified)"
}

Important:
- For nicheCategory, choose the most appropriate from the list
- Map remote/hybrid/on-site to remoteType
- Extract salary ranges when available
- If salary not disclosed, set isCompetitive to true
- Parse benefits into specificBenefits array
- Return only valid JSON, no explanations`
          },
          {
            role: "user",
            content: `Parse this job posting HTML and return structured JSON:\n\n${htmlContent.substring(0, 15000)}`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const parsedData = JSON.parse(completion.choices[0].message.content || "{}");

      // Validate required fields
      if (!parsedData.title) {
        return NextResponse.json(
          { error: "Could not extract job title from the posting. Please try a different URL or enter details manually." },
          { status: 400 }
        );
      }

      // Transform data to match frontend expectations
      const jobData = {
        // Step 1: Job Basics
        title: parsedData.title || "",
        nicheCategory: parsedData.nicheCategory || "",
        employmentType: parsedData.employmentType || "FULL_TIME",
        experienceLevel: parsedData.experienceLevel || "MID",
        location: parsedData.location || "",
        remoteType: parsedData.remoteType || "REMOTE",

        // Step 2: Job Description
        description: parsedData.description || "",
        keyResponsibilities: Array.isArray(parsedData.keyResponsibilities) ? parsedData.keyResponsibilities : [],
        skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
        niceToHaveSkills: Array.isArray(parsedData.niceToHaveSkills) ? parsedData.niceToHaveSkills : [],
        techStack: Array.isArray(parsedData.techStack) ? parsedData.techStack : [],

        // Step 3: Compensation & Benefits
        salaryMin: typeof parsedData.salaryMin === 'number' ? parsedData.salaryMin : 0,
        salaryMax: typeof parsedData.salaryMax === 'number' ? parsedData.salaryMax : 0,
        isCompetitive: parsedData.isCompetitive === true,
        equityOffered: parsedData.equityOffered === true,
        specificBenefits: Array.isArray(parsedData.specificBenefits) ? parsedData.specificBenefits : [],

        // Additional fields
        hiringTimeline: parsedData.hiringTimeline || "",
        deadline: parsedData.deadline || "",

        // Steps 4-6 will be filled in manually during customization phase
        requiresAssessment: false,
        minSkillsScore: 0,
        requiredTier: "ANY",
        customAssessmentQuestions: [],
        interviewRoundsDetailed: [
          { roundNumber: 1, roundName: '', roundDescription: '', duration: '' }
        ],
        startDateNeeded: "",
        maxApplicants: "",
        screeningQuestions: [],
      };

      return NextResponse.json({
        success: true,
        jobData,
        message: "Job details imported successfully!"
      });
    } catch (error) {
      console.error("OpenAI parsing error:", error);
      return NextResponse.json(
        { error: "Failed to parse job posting. The AI service may be unavailable or the content format is not supported." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Job import error:", error);

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
      { error: "Failed to import job posting" },
      { status: 500 }
    );
  }
}
