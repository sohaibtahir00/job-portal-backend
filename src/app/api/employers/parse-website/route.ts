import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/employers/parse-website
 * Parse company website using AI to extract company information
 */
export async function POST(request: NextRequest) {
  try {
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "Website URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!parsedUrl.protocol.startsWith("http")) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return NextResponse.json(
        { error: "Please enter a valid website URL (e.g., https://example.com)" },
        { status: 400 }
      );
    }

    // Fetch website content
    let websiteContent: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JobPortalBot/1.0; +https://jobportal.com)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      websiteContent = extractTextFromHtml(html);

      if (websiteContent.length < 100) {
        return NextResponse.json(
          { error: "Couldn't extract enough content from this website. Please fill in your company details manually." },
          { status: 400 }
        );
      }
    } catch (error: any) {
      console.error("Website fetch error:", error);
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "Website took too long to respond. Please try again or fill in manually." },
          { status: 408 }
        );
      }
      return NextResponse.json(
        { error: "Couldn't reach this website. Please check the URL or fill in your company details manually." },
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

    // Parse website using GPT-4
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are a company information extractor. Analyze website content and extract structured company data.
Return a JSON object with these exact fields (use null for any field you cannot determine with confidence):

{
  "companyName": "Official company name (not tagline)",
  "description": "Brief company description, 2-3 sentences max about what the company does",
  "industry": "Primary industry (e.g., Technology, Healthcare, Finance, E-commerce, SaaS, AI/ML, Cybersecurity, etc.)",
  "location": "Headquarters location (City, State/Country format) or null",
  "companySize": "Estimated company size. Use one of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+ or null if unknown",
  "phone": "Company phone number in international format or null",
  "logo": "URL to company logo image if found in the page, or null"
}

Tips for finding each field:
- companyName: Use the official name, not marketing taglines
- description: Summarize what the company does in plain language
- location: Look in footer, Contact page content, About section, "Headquarters" or "HQ" mentions, address blocks
- companySize: Look for employee count on About/Careers page, "team of X", "X employees", or estimate from context (e.g., enterprise = 1000+, startup = 1-50)
- phone: Look in footer, Contact section, Support section, or tel: links. Format with country code if possible
- logo: Look for og:image meta tag, logo in header, or favicon - provide full URL if found

Important:
- Try hard to find location, companySize, and phone - these are commonly in footers or contact sections
- If you see an address, extract the city/state/country for location
- Return only valid JSON, no explanations or markdown`
        },
        {
          role: "user",
          content: `Analyze this company website and extract company information.

Website URL: ${parsedUrl.toString()}

Website Content:
${websiteContent.substring(0, 10000)}`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "Failed to parse website content. Please fill in manually." },
        { status: 500 }
      );
    }

    try {
      const parsedData = JSON.parse(content);

      // Validate and clean the response
      const result = {
        companyName: typeof parsedData.companyName === "string" ? parsedData.companyName.trim() : null,
        description: typeof parsedData.description === "string" ? parsedData.description.trim() : null,
        industry: typeof parsedData.industry === "string" ? parsedData.industry.trim() : null,
        location: typeof parsedData.location === "string" ? parsedData.location.trim() : null,
        companySize: typeof parsedData.companySize === "string" ? parsedData.companySize.trim() : null,
        phone: typeof parsedData.phone === "string" ? parsedData.phone.trim() : null,
        logo: typeof parsedData.logo === "string" && parsedData.logo.startsWith("http") ? parsedData.logo : null,
      };

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please fill in manually." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Website parser error:", error);

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
      { error: "Failed to parse website" },
      { status: 500 }
    );
  }
}

/**
 * Extract text content from HTML, including meta tags
 */
function extractTextFromHtml(html: string): string {
  // Extract meta tags first (for og:image, description, etc.)
  const metaTags: string[] = [];
  const metaRegex = /<meta[^>]+>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metaTags.push(metaMatch[0]);
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Remove script and style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML tags but keep content
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Combine meta tags info with text content
  const metaInfo = metaTags.join("\n");

  return `Page Title: ${title}\n\nMeta Tags:\n${metaInfo}\n\nPage Content:\n${text}`;
}
