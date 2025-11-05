import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/messages/unread
 * Get count of unread messages for current user
 * Lightweight endpoint for notification badges
 *
 * Authentication: Required
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Count unread messages
    const unreadCount = await prisma.message.count({
      where: {
        receiverId: user.id,
        status: { in: ["SENT", "DELIVERED"] },
      },
    });

    // Get recent unread messages (last 5)
    const recentUnread = await prisma.message.findMany({
      where: {
        receiverId: user.id,
        status: { in: ["SENT", "DELIVERED"] },
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    const formattedRecentUnread = recentUnread.map((msg) => ({
      id: msg.id,
      sender: msg.sender,
      subject: msg.subject,
      preview: msg.content.substring(0, 80) + (msg.content.length > 80 ? "..." : ""),
      createdAt: msg.createdAt,
    }));

    return NextResponse.json({
      unreadCount,
      recentUnread: formattedRecentUnread,
      hasUnread: unreadCount > 0,
    });
  } catch (error) {
    console.error("Get unread count error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch unread count",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/messages/unread
 * Mark all messages as read for current user
 *
 * Authentication: Required
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Mark all unread messages as read
    const result = await prisma.message.updateMany({
      where: {
        receiverId: user.id,
        status: { in: ["SENT", "DELIVERED"] },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "All messages marked as read",
      count: result.count,
    });
  } catch (error) {
    console.error("Mark all as read error:", error);

    return NextResponse.json(
      {
        error: "Failed to mark all messages as read",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
