import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employer/agreement-status
 * Returns comprehensive status for UI gating
 * Returns: {
 *   hasSignedAgreement: boolean,
 *   agreementSignedAt: Date | null,
 *   canViewFullProfiles: boolean,
 *   canClaimJobs: boolean
 * }
 */
export async function GET(request: NextRequest) {
  console.log('📋 [AGREEMENT-STATUS] GET request received');

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

    // Find employer record with service agreement
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

    const hasSignedAgreement = !!employer.serviceAgreement;
    const agreementSignedAt = employer.serviceAgreement?.signedAt || null;

    // Both capabilities require a signed agreement
    const canViewFullProfiles = hasSignedAgreement;
    const canClaimJobs = hasSignedAgreement;

    console.log('✅ [AGREEMENT-STATUS] Employer:', employer.companyName, 'Has signed:', hasSignedAgreement);

    return NextResponse.json({
      hasSignedAgreement,
      agreementSignedAt,
      canViewFullProfiles,
      canClaimJobs,
    });

  } catch (error) {
    console.error('❌ [AGREEMENT-STATUS] Error:', error);
    return NextResponse.json(
      { error: "Failed to check agreement status" },
      { status: 500 }
    );
  }
}
