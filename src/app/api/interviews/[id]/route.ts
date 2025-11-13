import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper function to get authenticated user
async function getAuthenticatedUser(req: NextRequest) {
  // Try to get user from headers first (for cross-domain requests)
  const userEmail = req.headers.get('X-User-Email');
  const userRole = req.headers.get('X-User-Role');
  const userId = req.headers.get('X-User-Id');

  if (userEmail && userId && userRole) {
    // Get user from headers (cross-domain request from frontend)
    return await prisma.user.findUnique({
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
      return {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      };
    }
  }

  return null;
}

// GET /api/interviews/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const interview = await prisma.interview.findUnique({
      where: { id: params.id },
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
        availabilitySlots: {
          orderBy: {
            startTime: "asc",
          },
        },
        selectedSlots: {
          include: {
            availability: true,
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    return NextResponse.json({ interview });
  } catch (error) {
    console.error("Get interview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch interview" },
      { status: 500 }
    );
  }
}

// PATCH /api/interviews/[id] - Update interview
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates = await req.json();

    const interview = await prisma.interview.update({
      where: { id: params.id },
      data: updates,
    });

    return NextResponse.json({ success: true, interview });
  } catch (error) {
    console.error("Update interview error:", error);
    return NextResponse.json(
      { error: "Failed to update interview" },
      { status: 500 }
    );
  }
}

// DELETE /api/interviews/[id] - Cancel interview
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.interview.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel interview error:", error);
    return NextResponse.json(
      { error: "Failed to cancel interview" },
      { status: 500 }
    );
  }
}
