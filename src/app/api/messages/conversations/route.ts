import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/messages/conversations
 * Get list of conversations (grouped by users)
 * Shows the most recent message in each conversation
 *
 * Query parameters:
 * - limit: number (default: 20, max: 50)
 * - offset: number (default: 0)
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

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = Math.min(parseInt(limitParam || "20", 10), 50);
    const offset = parseInt(offsetParam || "0", 10);

    // Get all messages where user is sender or receiver
    const allMessages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Group messages by conversation partner
    const conversationsMap = new Map<string, any>();

    allMessages.forEach((msg) => {
      // Determine the other party in the conversation
      const otherParty = msg.senderId === user.id ? msg.receiver : msg.sender;
      const otherPartyId = otherParty.id;

      // If we haven't seen this conversation yet, or this message is more recent
      if (!conversationsMap.has(otherPartyId)) {
        conversationsMap.set(otherPartyId, {
          otherParty,
          lastMessage: msg,
          unreadCount: 0,
          totalMessages: 0,
        });
      }

      const conversation = conversationsMap.get(otherPartyId);
      conversation.totalMessages++;

      // Count unread messages (messages we received that are not read)
      if (msg.receiverId === user.id && msg.status !== "READ") {
        conversation.unreadCount++;
      }
    });

    // Convert map to array and sort by last message date
    const conversations = Array.from(conversationsMap.values())
      .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime())
      .slice(offset, offset + limit);

    // Format conversations
    const formattedConversations = conversations.map((conv) => ({
      participant: {
        id: conv.otherParty.id,
        name: conv.otherParty.name,
        email: conv.otherParty.email,
        role: conv.otherParty.role,
        image: conv.otherParty.image,
      },
      lastMessage: {
        id: conv.lastMessage.id,
        subject: conv.lastMessage.subject,
        content: conv.lastMessage.content.substring(0, 100) + (conv.lastMessage.content.length > 100 ? "..." : ""),
        status: conv.lastMessage.status,
        createdAt: conv.lastMessage.createdAt,
        isSent: conv.lastMessage.senderId === user.id,
      },
      unreadCount: conv.unreadCount,
      totalMessages: conv.totalMessages,
    }));

    // Calculate total unread across all conversations
    const totalUnread = Array.from(conversationsMap.values())
      .reduce((sum, conv) => sum + conv.unreadCount, 0);

    return NextResponse.json({
      conversations: formattedConversations,
      pagination: {
        limit,
        offset,
        total: conversationsMap.size,
        hasMore: offset + limit < conversationsMap.size,
      },
      totalUnread,
    });
  } catch (error) {
    console.error("Get conversations error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch conversations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
