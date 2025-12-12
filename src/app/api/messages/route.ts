import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole, NotificationType } from "@prisma/client";
import { sendEmail, EMAIL_CONFIG } from "@/lib/email";

/**
 * POST /api/messages
 * Send a message to another user
 *
 * Request body:
 * {
 *   "receiverId": "string",
 *   "subject": "string" (optional),
 *   "content": "string",
 *   "applicationId": "string" (optional - for context)
 * }
 *
 * Authentication: Required
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { receiverId, subject, content, applicationId } = body;

    // Validate required fields
    if (!receiverId) {
      return NextResponse.json(
        { error: "receiverId is required" },
        { status: 400 }
      );
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    // Validate content length
    if (content.length > 5000) {
      return NextResponse.json(
        { error: "Message content must be less than 5000 characters" },
        { status: 400 }
      );
    }

    // Cannot send message to yourself
    if (receiverId === user.id) {
      return NextResponse.json(
        { error: "Cannot send message to yourself" },
        { status: 400 }
      );
    }

    // Get receiver
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        notifyMessages: true,
      },
    });

    if (!receiver) {
      return NextResponse.json(
        { error: "Receiver not found" },
        { status: 404 }
      );
    }

    // Check if receiver is active
    if (receiver.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Cannot send message to inactive user" },
        { status: 400 }
      );
    }

    // Verify application context if provided
    let application = null;
    if (applicationId) {
      application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: {
            include: {
              employer: {
                select: {
                  userId: true,
                  companyName: true,
                },
              },
            },
          },
          candidate: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!application) {
        return NextResponse.json(
          { error: "Application not found" },
          { status: 404 }
        );
      }

      // Verify sender/receiver are part of this application
      const isCandidate = application.candidate.userId === user.id;
      const isEmployer = application.job.employer.userId === user.id;

      if (!isCandidate && !isEmployer) {
        return NextResponse.json(
          { error: "You are not authorized to message about this application" },
          { status: 403 }
        );
      }

      // Verify receiver is the other party
      const expectedReceiverId = isCandidate
        ? application.job.employer.userId
        : application.candidate.userId;

      if (receiverId !== expectedReceiverId) {
        return NextResponse.json(
          { error: "Invalid receiver for this application context" },
          { status: 400 }
        );
      }
    }

    // Auto-generate subject if not provided
    let messageSubject = subject;
    if (!messageSubject && applicationId && application) {
      messageSubject = `Re: ${application.job.title}`;
    } else if (!messageSubject) {
      messageSubject = "New Message";
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId: user.id,
        receiverId,
        subject: messageSubject,
        content: content.trim(),
        status: "SENT",
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

    // Send email notification to receiver (if enabled)
    if (receiver.notifyMessages) {
      try {
        const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #f5f5f5;">
              <tr>
                <td style="padding: 40px 20px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 40px 60px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                          💬 New Message
                        </h1>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px; background-color: #ffffff;">
                        <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                          Hi <strong>${receiver.name}</strong>,
                        </p>

                        <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.6;">
                          You've received a new message from <strong>${user.name}</strong>:
                        </p>

                        <!-- Message Box -->
                        <div style="background: #f9fafb; border-left: 4px solid #4F46E5; padding: 20px; margin: 0 0 30px; border-radius: 4px;">
                          <p style="margin: 0 0 10px; color: #4F46E5; font-weight: 600; font-size: 16px;">
                            ${messageSubject}
                          </p>
                          <p style="margin: 0; color: #333333; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                            ${content.trim().substring(0, 300)}${content.length > 300 ? "..." : ""}
                          </p>
                        </div>

                        ${application ? `
                        <div style="background-color: #EEF2FF; padding: 15px; margin: 0 0 30px; border-radius: 6px;">
                          <p style="margin: 0 0 5px; color: #4F46E5; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                            About Application
                          </p>
                          <p style="margin: 0; color: #333333; font-size: 14px;">
                            <strong>${application.job.title}</strong> at ${application.job.employer.companyName}
                          </p>
                        </div>
                        ` : ""}

                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                          <tr>
                            <td style="border-radius: 6px; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);">
                              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/messages/${message.id}"
                                 style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">
                                View Message
                              </a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 30px 0 0; color: #999999; font-size: 12px; line-height: 1.6; text-align: center;">
                          Or reply directly to this email to send a message back.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                          © ${new Date().getFullYear()} ${EMAIL_CONFIG.appName}. All rights reserved.
                        </p>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      await sendEmail({
        to: receiver.email,
        subject: `New message from ${user.name}: ${messageSubject}`,
        html: emailHtml,
      });
      } catch (emailError) {
        console.error("Failed to send message notification email:", emailError);
        // Don't fail the message sending if email fails
      }
    }

    // Create in-app notification for receiver
    try {
      const dashboardPath = receiver.role === "EMPLOYER" ? "/employer/messages" : "/candidate/messages";
      await prisma.notification.create({
        data: {
          userId: receiverId,
          type: NotificationType.MESSAGE_RECEIVED,
          title: "New Message",
          message: `${user.name} sent you a message: "${messageSubject}"`,
          link: dashboardPath,
        },
      });
    } catch (notifError) {
      console.error("Failed to create message notification:", notifError);
    }

    return NextResponse.json(
      {
        message: "Message sent successfully",
        data: {
          id: message.id,
          senderId: message.senderId,
          senderName: message.sender.name,
          senderRole: message.sender.role,
          receiverId: message.receiverId,
          receiverName: message.receiver.name,
          receiverRole: message.receiver.role,
          subject: message.subject,
          content: message.content,
          status: message.status,
          createdAt: message.createdAt,
          applicationId: applicationId || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Send message error:", error);

    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/messages
 * Get messages for current user (inbox + sent)
 *
 * Query parameters:
 * - type: "inbox" | "sent" (default: "inbox")
 * - status: "SENT" | "DELIVERED" | "READ" (optional)
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 * - search: string (search in subject/content)
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
    const type = searchParams.get("type") || "inbox";
    const status = searchParams.get("status");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const search = searchParams.get("search");

    // Validate and parse pagination
    const limit = Math.min(
      parseInt(limitParam || "50", 10),
      100
    );
    const offset = parseInt(offsetParam || "0", 10);

    // Build where clause
    const where: any = type === "inbox"
      ? { receiverId: user.id }
      : { senderId: user.id };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get messages with pagination
    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where,
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
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    // Get unread count for inbox
    let unreadCount = 0;
    if (type === "inbox") {
      unreadCount = await prisma.message.count({
        where: {
          receiverId: user.id,
          status: { in: ["SENT", "DELIVERED"] },
        },
      });
    }

    // Format messages
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      sender: {
        id: msg.sender.id,
        name: msg.sender.name,
        email: msg.sender.email,
        role: msg.sender.role,
        image: msg.sender.image,
      },
      receiver: {
        id: msg.receiver.id,
        name: msg.receiver.name,
        email: msg.receiver.email,
        role: msg.receiver.role,
        image: msg.receiver.image,
      },
      subject: msg.subject,
      content: msg.content,
      status: msg.status,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
      isUnread: msg.status !== "READ" && type === "inbox",
    }));

    // Calculate pagination info
    const hasMore = offset + limit < totalCount;
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return NextResponse.json({
      messages: formattedMessages,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore,
        totalPages,
        currentPage,
      },
      unreadCount: type === "inbox" ? unreadCount : undefined,
      type,
    });
  } catch (error) {
    console.error("Get messages error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch messages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
