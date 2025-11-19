import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = 'force-dynamic';

// GET - List all templates for employer (built-in + custom)
export async function GET(request: NextRequest) {
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

    // Get custom templates
    const customTemplates = await prisma.interviewTemplate.findMany({
      where: { employerId: employer.id },
      orderBy: [
        { isDefault: "desc" }, // Default template first
        { createdAt: "desc" },
      ],
    });

    // Built-in templates
    const builtInTemplates = [
      {
        id: "single-round",
        name: "Single Round Interview",
        isBuiltIn: true,
        isDefault: false,
        rounds: [
          {
            name: "Final Interview",
            duration: 60,
            description: "Comprehensive interview covering all aspects",
          },
        ],
      },
      {
        id: "standard-2-round",
        name: "Standard 2-Round Interview",
        isBuiltIn: true,
        isDefault: false,
        rounds: [
          {
            name: "Phone Screen",
            duration: 30,
            description: "Initial conversation with recruiter",
          },
          {
            name: "Final Interview",
            duration: 60,
            description: "In-depth interview with hiring manager",
          },
        ],
      },
      {
        id: "standard-3-round",
        name: "Standard 3-Round Interview",
        isBuiltIn: true,
        isDefault: false,
        rounds: [
          {
            name: "Phone Screen",
            duration: 30,
            description: "Initial conversation with recruiter",
          },
          {
            name: "Technical Interview",
            duration: 60,
            description: "Technical assessment with engineering team",
          },
          {
            name: "Final Interview",
            duration: 45,
            description: "Cultural fit and final discussion",
          },
        ],
      },
      {
        id: "comprehensive-4-round",
        name: "Comprehensive 4-Round Interview",
        isBuiltIn: true,
        isDefault: false,
        rounds: [
          {
            name: "Phone Screen",
            duration: 30,
            description: "Initial conversation with recruiter",
          },
          {
            name: "Technical Interview",
            duration: 60,
            description: "Technical assessment",
          },
          {
            name: "Team Interview",
            duration: 45,
            description: "Meet the team",
          },
          {
            name: "Executive Interview",
            duration: 45,
            description: "Final discussion with leadership",
          },
        ],
      },
    ];

    // Format custom templates
    const formattedCustomTemplates = customTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      isBuiltIn: false,
      isDefault: template.isDefault,
      rounds: template.rounds,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));

    // Combine built-in and custom templates
    const allTemplates = [...builtInTemplates, ...formattedCustomTemplates];

    return NextResponse.json({ templates: allTemplates });
  } catch (error) {
    console.error("Get templates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

// POST - Create new custom template
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "EMPLOYER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, rounds, isDefault } = await request.json();

    // Validation
    if (!name || !rounds || !Array.isArray(rounds) || rounds.length === 0) {
      return NextResponse.json(
        { error: "Template name and at least one round are required" },
        { status: 400 }
      );
    }

    // Validate rounds structure
    for (const round of rounds) {
      if (!round.name || !round.duration) {
        return NextResponse.json(
          { error: "Each round must have a name and duration" },
          { status: 400 }
        );
      }
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

    // If setting as default, unset other defaults
    if (isDefault) {
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

    // Create template
    const template = await prisma.interviewTemplate.create({
      data: {
        employerId: employer.id,
        name,
        rounds,
        isDefault: isDefault || false,
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
    console.error("Create template error:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
