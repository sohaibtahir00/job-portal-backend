import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// In-memory settings (in production, store in database)
let platformSettings = {
  platform: {
    name: "SkillProof",
    url: process.env.NEXTAUTH_URL || "https://skillproof.com",
    supportEmail: "support@skillproof.com",
  },
  fees: {
    juniorMid: 15,
    senior: 18,
    leadStaff: 20,
  },
  testing: {
    imochaApiKey: process.env.IMOCHA_API_KEY || "",
    testDuration: 60,
    passingScore: 0,
    retakeCooldown: 30,
  },
  jobAggregation: {
    jobBoardlyApiKey: process.env.JOB_BOARDLY_API_KEY || "",
    autoSyncFrequency: "daily",
    autoApprove: false,
  },
  email: {
    provider: "resend",
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: "noreply@skillproof.com",
    fromName: "SkillProof",
  },
  payment: {
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    payment1Percentage: 50,
    payment2Percentage: 50,
    payment2DueAfterDays: 30,
    invoicePrefix: "INV-",
    invoiceTerms: "Net 30",
    lateFeePercentage: 5,
    guaranteePeriodDays: 90,
  },
  security: {
    twoFactorEnabled: false,
    passwordMinLength: 8,
    requireSpecialChars: true,
    requireNumbers: true,
    sessionTimeoutMinutes: 60,
    maxFailedAttempts: 5,
  },
  notifications: {
    adminNotifications: {
      newEmployerSignup: true,
      newJobPosted: true,
      newPlacement: true,
      paymentReceived: true,
      assessmentFlagged: true,
    },
    channels: ["email"],
  },
};

/**
 * GET /api/admin/platform-settings
 * Get platform-wide settings (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    return NextResponse.json({
      success: true,
      settings: platformSettings,
    });
  } catch (error: any) {
    console.error("Get platform settings error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/platform-settings
 * Update platform-wide settings (admin only)
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const updates = await req.json();

    // Deep merge updates with existing settings
    platformSettings = {
      ...platformSettings,
      ...updates,
      platform: { ...platformSettings.platform, ...updates.platform },
      fees: { ...platformSettings.fees, ...updates.fees },
      testing: { ...platformSettings.testing, ...updates.testing },
      jobAggregation: { ...platformSettings.jobAggregation, ...updates.jobAggregation },
      email: { ...platformSettings.email, ...updates.email },
      payment: { ...platformSettings.payment, ...updates.payment },
      security: { ...platformSettings.security, ...updates.security },
      notifications: { ...platformSettings.notifications, ...updates.notifications },
    };

    return NextResponse.json({
      success: true,
      settings: platformSettings,
      message: "Settings updated successfully",
    });
  } catch (error: any) {
    console.error("Update platform settings error:", error);
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
