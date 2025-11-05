import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * PATCH /api/messages/[id]/read
 * Mark a message as read
 * Only the receiver can mark their message as read
 *
 * Authentication: Required
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = params;

    // Get message
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            name: true,
          },
        },
        receiver: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Check if current user is the receiver
    if (message.receiverId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden. Only the receiver can mark this message as read." },
        { status: 403 }
      );
    }

    // Check if already read
    if (message.status === "READ") {
      return NextResponse.json({
        message: "Message is already marked as read",
        data: {
          id: message.id,
          status: message.status,
          readAt: message.readAt,
        },
      });
    }

    // Mark as read
    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        status: "READ",
        readAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "Message marked as read",
      data: {
        id: updatedMessage.id,
        sender: updatedMessage.sender,
        receiver: updatedMessage.receiver,
        subject: updatedMessage.subject,
        content: updatedMessage.content,
        status: updatedMessage.status,
        readAt: updatedMessage.readAt,
        createdAt: updatedMessage.createdAt,
      },
    });
  } catch (error) {
    console.error("Mark message as read error:", error);

    return NextResponse.json(
      {
        error: "Failed to mark message as read",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages/[id]/read
 * Alternative endpoint to mark message as read (supports POST for compatibility)
 *
 * Authentication: Required
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Delegate to PATCH handler
  return PATCH(request, { params });
}
