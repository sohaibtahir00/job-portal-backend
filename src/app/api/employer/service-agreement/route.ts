import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

// Current agreement version
const AGREEMENT_VERSION = "v1.0";

// Full service agreement text
const AGREEMENT_TEXT = `
HIREHUB AI SERVICE AGREEMENT

Effective Date: Upon Electronic Acceptance

This Service Agreement ("Agreement") is entered into between HireHub AI ("Company", "we", "us", "our") and the employer organization ("Employer", "you", "your") identified during registration.

1. SERVICES PROVIDED

1.1 HireHub AI provides a technology-enabled recruitment platform connecting Employers with pre-vetted technology professionals ("Candidates").

1.2 Our services include:
- Access to our curated database of technology professionals
- Candidate skills assessment and verification
- Profile matching and recommendations
- Interview scheduling and coordination
- Placement facilitation

2. FEE STRUCTURE

2.1 Success Fee: You agree to pay a placement fee equal to 15-20% of the Candidate's first-year base salary upon successful hiring of any Candidate introduced through our platform.

2.2 Payment Terms:
- 50% of the placement fee is due upon signed offer acceptance
- Remaining 50% is due upon the Candidate's start date
- All fees are non-refundable except as specified in Section 4

2.3 Fee Calculation: The placement fee is calculated based on the Candidate's annual base salary (excluding bonuses, equity, or other compensation).

3. CANDIDATE INTRODUCTION & PROTECTION PERIOD

3.1 Introduction Definition: A Candidate is considered "introduced" when you:
- View the Candidate's full profile (including contact information)
- Receive Candidate information via email or direct communication
- Interview the Candidate through any channel
- Receive the Candidate's resume or application materials

3.2 Protection Period: Once a Candidate is introduced, a 12-month protection period begins. If you hire the introduced Candidate within this period, whether directly or indirectly, the placement fee applies.

3.3 Prior Relationship Exception: If you have documented evidence of a prior relationship with the Candidate (employment, interview, or formal contact within 6 months before introduction), you must notify us within 48 hours of receiving the introduction. We will review and may waive the fee if substantiated.

4. GUARANTEE PERIOD

4.1 90-Day Guarantee: If a placed Candidate leaves or is terminated within 90 days of their start date, we will:
- Provide one replacement candidate at no additional fee, OR
- Issue a prorated refund based on days worked

4.2 Refund Calculation:
- 0-30 days: 100% refund
- 31-60 days: 50% refund
- 61-90 days: 25% refund

4.3 Exclusions: The guarantee does not apply if:
- Termination is due to company layoffs, restructuring, or budget cuts
- The Candidate leaves due to material changes in job duties, location, or compensation
- You fail to provide reasonable onboarding and support

5. CANDIDATE HIRING OBLIGATIONS

5.1 Exclusive Engagement: While actively interviewing a Candidate introduced through our platform, you agree not to engage with the same Candidate through other recruitment channels.

5.2 Offer Notification: You must notify us within 24 hours of extending an offer to any introduced Candidate.

5.3 Circumvention: You agree not to circumvent our services by:
- Contacting Candidates directly after their profiles are removed from our platform
- Hiring Candidates through another agency who were first introduced by HireHub AI
- Encouraging Candidates to apply directly to avoid fees

6. DATA PRIVACY & CONFIDENTIALITY

6.1 Candidate Information: All Candidate information is confidential and may only be used for legitimate hiring purposes.

6.2 Data Protection: You agree to handle Candidate data in compliance with applicable privacy laws.

6.3 Non-Disclosure: You will not share Candidate profiles or information with third parties without our written consent.

7. TERM & TERMINATION

7.1 This Agreement remains in effect for as long as you maintain an active employer account.

7.2 Either party may terminate with 30 days written notice, but termination does not affect:
- Outstanding fee obligations for already-introduced Candidates
- Protection periods already in effect

8. LIMITATION OF LIABILITY

8.1 HireHub AI's total liability shall not exceed the fees paid by you in the 12 months preceding any claim.

8.2 We are not liable for:
- Candidate performance or conduct
- Your hiring decisions
- Indirect or consequential damages

9. DISPUTE RESOLUTION

9.1 Any disputes will first be addressed through good-faith negotiation.

9.2 If unresolved, disputes will be submitted to binding arbitration under AAA Commercial Arbitration Rules.

10. GENERAL PROVISIONS

10.1 This Agreement constitutes the entire agreement between the parties.

10.2 We may update these terms with 30 days notice. Continued use of services constitutes acceptance.

10.3 This Agreement is governed by the laws of Delaware, USA.

BY SIGNING BELOW, YOU CONFIRM THAT:
- You have authority to bind your organization to this Agreement
- You have read and understood all terms
- You agree to be bound by this Agreement

Electronic Signature Acknowledgment:
Your electronic signature below has the same legal effect as a handwritten signature.
`;

/**
 * GET /api/employer/service-agreement
 * Check if current employer has signed agreement
 * Returns: { hasSigned: boolean, signedAt?: Date, agreementVersion?: string }
 */
export async function GET(request: NextRequest) {
  console.log('📜 [SERVICE-AGREEMENT] GET request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Employer role required" },
        { status: 403 }
      );
    }

    // Find employer record
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        serviceAgreement: true,
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    const agreement = employer.serviceAgreement;

    if (!agreement) {
      return NextResponse.json({
        hasSigned: false,
        signedAt: null,
        agreementVersion: null,
      });
    }

    return NextResponse.json({
      hasSigned: true,
      signedAt: agreement.signedAt,
      agreementVersion: agreement.agreementVersion,
    });

  } catch (error) {
    console.error('❌ [SERVICE-AGREEMENT] Error:', error);
    return NextResponse.json(
      { error: "Failed to check service agreement status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/employer/service-agreement
 * Sign the service agreement
 * Request body: { signerName: string, signerTitle: string, agreedToTerms: boolean }
 * Returns: { success: true, signedAt: Date }
 */
export async function POST(request: NextRequest) {
  console.log('📜 [SERVICE-AGREEMENT] POST request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role !== UserRole.EMPLOYER) {
      return NextResponse.json(
        { error: "Employer role required" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { signerName, signerTitle, agreedToTerms } = body;

    // Validate required fields
    if (!signerName || typeof signerName !== 'string' || signerName.trim().length === 0) {
      return NextResponse.json(
        { error: "Signer name is required" },
        { status: 400 }
      );
    }

    if (!signerTitle || typeof signerTitle !== 'string' || signerTitle.trim().length === 0) {
      return NextResponse.json(
        { error: "Signer title is required" },
        { status: 400 }
      );
    }

    if (agreedToTerms !== true) {
      return NextResponse.json(
        { error: "You must agree to the terms to proceed" },
        { status: 400 }
      );
    }

    // Find employer record
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: {
        serviceAgreement: true,
      },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check if already signed
    if (employer.serviceAgreement) {
      return NextResponse.json(
        { error: "Service agreement already signed" },
        { status: 400 }
      );
    }

    // Capture IP address from request headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';

    const now = new Date();

    // Create service agreement record
    const serviceAgreement = await prisma.serviceAgreement.create({
      data: {
        employerId: employer.id,
        signedAt: now,
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        signerEmail: user.email,
        ipAddress,
        agreementVersion: AGREEMENT_VERSION,
        agreementText: AGREEMENT_TEXT,
      },
    });

    console.log('✅ [SERVICE-AGREEMENT] Agreement signed by:', signerName, 'for employer:', employer.companyName);

    return NextResponse.json({
      success: true,
      signedAt: serviceAgreement.signedAt,
    });

  } catch (error) {
    console.error('❌ [SERVICE-AGREEMENT] Error:', error);
    return NextResponse.json(
      { error: "Failed to sign service agreement" },
      { status: 500 }
    );
  }
}
