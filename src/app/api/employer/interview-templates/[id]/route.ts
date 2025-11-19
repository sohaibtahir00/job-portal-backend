import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = 'force-dynamic';

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, rounds, isDefault } = await request.json();

    // Get employer ID
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check if template exists and belongs to employer
    const existingTemplate = await prisma.interviewTemplate.findUnique({
      where: { id: params.id },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (existingTemplate.employerId !== employer.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // If setting as default, unset other defaults
    if (isDefault && !existingTemplate.isDefault) {
      await prisma.interviewTemplate.updateMany({
        where: {
          employerId: employer.id,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Update template
    const template = await prisma.interviewTemplate.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(rounds && { rounds }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        isBuiltIn: false,
        isDefault: template.isDefault,
        rounds: template.rounds,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

// DELETE - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get employer ID
    const employer = await prisma.employer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!employer) {
      return NextResponse.json(
        { error: "Employer profile not found" },
        { status: 404 }
      );
    }

    // Check if template exists and belongs to employer
    const existingTemplate = await prisma.interviewTemplate.findUnique({
      where: { id: params.id },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (existingTemplate.employerId !== employer.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete template
    await prisma.interviewTemplate.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete template error:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
