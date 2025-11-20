import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // Use header-based authentication for cross-domain support
    const user = await getCurrentUser();
    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      include: { googleCalendar: true },
    });

    return NextResponse.json({
      connected: !!employer?.googleCalendar,
      email: employer?.googleCalendar?.email || null,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
