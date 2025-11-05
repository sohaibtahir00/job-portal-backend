import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/messages/[id]
 * Get a single message by ID
 * Automatically marks message as READ if current user is the receiver
 *
 * Access control:
 * - Sender can view their sent message
 * - Receiver can view their received message
 * - Admin can view any message
 *
 * Authentication: Required
 */
export async function GET(
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
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Check access permissions
    const isSender = message.senderId === user.id;
    const isReceiver = message.receiverId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isSender && !isReceiver && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden. You don't have access to this message." },
        { status: 403 }
      );
    }

    // Auto-mark as read if receiver is viewing and message is not already read
    if (isReceiver && message.status !== "READ") {
      await prisma.message.update({
        where: { id },
        data: {
          status: "READ",
          readAt: new Date(),
        },
      });
      message.status = "READ";
      message.readAt = new Date();
    }

    // Try to find related messages (conversation thread)
    // Find messages between the same two users
    const conversationMessages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: message.senderId,
            receiverId: message.receiverId,
          },
          {
            senderId: message.receiverId,
            receiverId: message.senderId,
          },
        ],
        // Same subject or no subject (consider part of same thread)
        ...(message.subject && message.subject !== "New Message"
          ? { subject: message.subject }
          : {}),
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
        receiver: {
          select: {
            id: true,
            name: true,
            role: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50, // Limit conversation to last 50 messages
    });

    // Format conversation thread
    const thread = conversationMessages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      senderRole: msg.sender.role,
      senderImage: msg.sender.image,
      receiverId: msg.receiverId,
      receiverName: msg.receiver.name,
      receiverRole: msg.receiver.role,
      receiverImage: msg.receiver.image,
      content: msg.content,
      status: msg.status,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
      isCurrent: msg.id === id,
    }));

    return NextResponse.json({
      message: {
        id: message.id,
        sender: message.sender,
        receiver: message.receiver,
        subject: message.subject,
        content: message.content,
        status: message.status,
        readAt: message.readAt,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      },
      thread: {
        messages: thread,
        totalCount: conversationMessages.length,
        participants: [
          {
            id: message.sender.id,
            name: message.sender.name,
            role: message.sender.role,
            image: message.sender.image,
          },
          {
            id: message.receiver.id,
            name: message.receiver.name,
            role: message.receiver.role,
            image: message.receiver.image,
          },
        ],
      },
    });
  } catch (error) {
    console.error("Get message error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/messages/[id]
 * Delete a message
 * Only the sender can delete their sent messages
 * Admins can delete any message
 *
 * Authentication: Required
 */
export async function DELETE(
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
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Check permissions - only sender or admin can delete
    const isSender = message.senderId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isSender && !isAdmin) {
      return NextResponse.json(
        { error: "Forbidden. Only the sender can delete their message." },
        { status: 403 }
      );
    }

    // Delete message
    await prisma.message.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Message deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Delete message error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
