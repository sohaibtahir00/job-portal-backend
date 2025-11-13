import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/interviews - Get user's interviews
export async function GET(req: NextRequest) {
  try {
    // Use getCurrentUser which properly handles cross-domain auth headers
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const applicationId = searchParams.get("applicationId");

    // Get the Employer or Candidate record
    let employerId = null;
    let candidateId = null;

    if (user.role === "EMPLOYER") {
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!employer) {
        return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      }
      employerId = employer.id;
    } else if (user.role === "CANDIDATE") {
      const candidate = await prisma.candidate.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!candidate) {
        return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
      }
      candidateId = candidate.id;
    }

    // Build where clause
    const whereClause: any = {
      ...(candidateId ? { candidateId } : { employerId }),
    };

    if (status && status !== "all") {
      whereClause.status = status.toUpperCase();
    }

    if (applicationId) {
      whereClause.applicationId = applicationId;
    }

    const interviews = await prisma.interview.findMany({
      where: whereClause,
      include: {
        application: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                location: true,
                type: true,
              },
            },
            candidate: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ interviews });
  } catch (error) {
    console.error("Get interviews error:", error);
    return NextResponse.json(
      { error: "Failed to fetch interviews" },
      { status: 500 }
    );
  }
}

// POST /api/interviews - Schedule new interview
export async function POST(req: NextRequest) {
  try {
    // Try to get user from headers first (for cross-domain requests)
    const userEmail = req.headers.get('X-User-Email');
    const userRole = req.headers.get('X-User-Role');
    const userId = req.headers.get('X-User-Id');

    let user = null;

    if (userEmail && userId && userRole) {
      // Get user from headers (cross-domain request from frontend)
      user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          role: true,
        },
      });
    } else {
      // Fall back to session-based auth (same-domain request)
      const session = await getServerSession(authOptions);
      if (session?.user) {
        user = {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
        };
      }
    }

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      applicationId,
      scheduledAt,
      duration,
      type,
      location,
      meetingLink,
      notes,
    } = await req.json();

    const interview = await prisma.interview.create({
      data: {
        applicationId,
        scheduledAt: new Date(scheduledAt),
        duration,
        type,
        location,
        meetingLink,
        notes,
        status: "SCHEDULED",
      },
    });

    // TODO: Send notification to candidate

    return NextResponse.json({ success: true, interview });
  } catch (error) {
    console.error("Schedule interview error:", error);
    return NextResponse.json(
      { error: "Failed to schedule interview" },
      { status: 500 }
    );
  }
}
