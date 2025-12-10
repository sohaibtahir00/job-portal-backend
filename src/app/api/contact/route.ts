import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

// POST /api/contact - Submit contact form
export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json();

    // Validate inputs
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Send email to support team
    await sendEmail({
      to: process.env.SUPPORT_EMAIL || "support@getskillproof.com",
      subject: `Contact Form: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    // Send confirmation email to user
    await sendEmail({
      to: email,
      subject: "We received your message",
      html: `
        <h2>Thank you for contacting us!</h2>
        <p>Hi ${name},</p>
        <p>We've received your message and will get back to you within 24-48 hours.</p>
        <p><strong>Your message:</strong></p>
        <p>${message}</p>
        <br>
        <p>Best regards,</p>
        <p>The Job Portal Team</p>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
