import OpenAI from "openai";
import { RiskLevel } from "@prisma/client";

/**
 * OpenAI client for parsing candidate responses
 * Lazy-loaded to avoid build-time errors when API key is not present
 */
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Parsed check-in response structure
 */
export interface ParsedCheckInResponse {
  status:
    | "hired_there"
    | "hired_elsewhere"
    | "interviewing"
    | "offer"
    | "rejected"
    | "withdrew"
    | "still_looking"
    | "no_response"
    | "unclear";
  companyMentioned: string | null;
  isIntroducedCompany: boolean | null;
  employmentType: "full_time" | "contractor" | "part_time" | "unknown" | null;
  startDateMentioned: string | null;
  salaryMentioned: string | null;
  roleTitleMentioned: string | null;
  confidence: "high" | "medium" | "low";
  riskLevel: RiskLevel;
  riskReason: string | null;
  suggestedAction: string;
  summary: string;
}

/**
 * Parse a free-text email response from a candidate
 * Uses GPT-4o-mini for cost-effective structured extraction
 *
 * @param candidateReply - The raw email text from the candidate
 * @param introducedCompanyName - The company we introduced them to
 * @returns Parsed response with status, risk level, and extracted details
 */
export async function parseCheckInResponse(
  candidateReply: string,
  introducedCompanyName: string
): Promise<ParsedCheckInResponse> {
  // Get OpenAI client (lazy-loaded)
  const openai = getOpenAIClient();
  if (!openai) {
    console.error("[OpenAI] OPENAI_API_KEY is not configured");
    return {
      status: "unclear",
      companyMentioned: null,
      isIntroducedCompany: null,
      employmentType: null,
      startDateMentioned: null,
      salaryMentioned: null,
      roleTitleMentioned: null,
      confidence: "low",
      riskLevel: RiskLevel.MEDIUM,
      riskReason: "Could not parse response - OpenAI not configured",
      suggestedAction: "Manual review required - OpenAI API key not set",
      summary: "Unable to automatically parse response",
    };
  }

  const systemPrompt = `You are analyzing email responses from job candidates to determine their current employment status. Your task is to extract structured information from their reply.

You MUST return ONLY valid JSON with this exact structure (no markdown, no other text):
{
  "status": "hired_there" | "hired_elsewhere" | "interviewing" | "offer" | "rejected" | "withdrew" | "still_looking" | "no_response" | "unclear",
  "companyMentioned": "company name or null",
  "isIntroducedCompany": true | false | null,
  "employmentType": "full_time" | "contractor" | "part_time" | "unknown" | null,
  "startDateMentioned": "extracted date string or relative time like 'last month' or null",
  "salaryMentioned": "extracted salary info or null",
  "roleTitleMentioned": "job title they got or null",
  "confidence": "high" | "medium" | "low",
  "riskLevel": "HIGH" | "MEDIUM" | "LOW" | "CLEAR",
  "riskReason": "explanation of risk assessment, or null if CLEAR/LOW",
  "suggestedAction": "what the admin should do next",
  "summary": "1-2 sentence summary of the candidate's situation"
}

STATUS DEFINITIONS:
- "hired_there": Candidate says they were hired at the introduced company (${introducedCompanyName})
- "hired_elsewhere": Candidate got a job at a DIFFERENT company
- "interviewing": Still in interview process (at any company)
- "offer": Received an offer but hasn't accepted yet
- "rejected": Company declined to move forward with them
- "withdrew": Candidate withdrew their application
- "still_looking": Still job searching, no significant updates
- "no_response": Candidate mentions never hearing back
- "unclear": Cannot determine status from the message

RISK LEVEL RULES:
- "HIGH": Candidate explicitly mentions working at/starting at ${introducedCompanyName}. This is potential fee circumvention.
- "MEDIUM": Ambiguous response that could indicate employment at introduced company, OR mentions offer/hiring without clear company name
- "LOW": Candidate is still looking, interviewing, or clearly not hired at introduced company
- "CLEAR": Candidate clearly rejected, withdrew, or was hired elsewhere

IMPORTANT CONTEXT:
The candidate was introduced to: ${introducedCompanyName}
If they mention being hired at this specific company (or similar names/variations), this is HIGH risk and potential fee circumvention.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost effective for this task
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Candidate email reply:\n"""\n${candidateReply}\n"""\n\nAnalyze this response and extract employment status. Remember to return ONLY valid JSON.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistent parsing
      max_tokens: 500,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Map string risk level to enum
    const riskLevelMap: Record<string, RiskLevel> = {
      HIGH: RiskLevel.HIGH,
      MEDIUM: RiskLevel.MEDIUM,
      LOW: RiskLevel.LOW,
      CLEAR: RiskLevel.CLEAR,
    };

    return {
      status: parsed.status || "unclear",
      companyMentioned: parsed.companyMentioned || null,
      isIntroducedCompany: parsed.isIntroducedCompany ?? null,
      employmentType: parsed.employmentType || null,
      startDateMentioned: parsed.startDateMentioned || null,
      salaryMentioned: parsed.salaryMentioned || null,
      roleTitleMentioned: parsed.roleTitleMentioned || null,
      confidence: parsed.confidence || "low",
      riskLevel: riskLevelMap[parsed.riskLevel] || RiskLevel.MEDIUM,
      riskReason: parsed.riskReason || null,
      suggestedAction: parsed.suggestedAction || "Review response manually",
      summary: parsed.summary || "Response parsed",
    };
  } catch (error) {
    console.error("[OpenAI] Error parsing check-in response:", error);

    // Return a safe default that flags for manual review
    return {
      status: "unclear",
      companyMentioned: null,
      isIntroducedCompany: null,
      employmentType: null,
      startDateMentioned: null,
      salaryMentioned: null,
      roleTitleMentioned: null,
      confidence: "low",
      riskLevel: RiskLevel.MEDIUM,
      riskReason: `Failed to parse response: ${error instanceof Error ? error.message : "Unknown error"}`,
      suggestedAction: "Manual review required - AI parsing failed",
      summary: "Unable to automatically parse response",
    };
  }
}

/**
 * Batch parse multiple check-in responses
 * Useful for processing email forwards in bulk
 */
export async function parseMultipleCheckInResponses(
  responses: Array<{ id: string; reply: string; companyName: string }>
): Promise<Map<string, ParsedCheckInResponse>> {
  const results = new Map<string, ParsedCheckInResponse>();

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;
  for (let i = 0; i < responses.length; i += BATCH_SIZE) {
    const batch = responses.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (item) => {
      const parsed = await parseCheckInResponse(item.reply, item.companyName);
      return { id: item.id, parsed };
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      results.set(result.id, result.parsed);
    }
  }

  return results;
}

export default {
  parseCheckInResponse,
  parseMultipleCheckInResponses,
};
