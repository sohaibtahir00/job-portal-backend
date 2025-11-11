import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@prisma/client";

/**
 * GET /api/employer/invoices
 * Get all invoices for employer (derived from placements)
 * Returns list of invoices with payment status
 *
 * Access control:
 * - EMPLOYER: Can view their own company's invoices
 * - ADMIN: Can view all invoices
 *
 * Query parameters:
 * - status: "PENDING" | "PARTIAL" | "PAID" (optional filter)
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  console.log('💰 [EMPLOYER/INVOICES] GET request received');

  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only employers and admins can access
    if (user.role !== UserRole.EMPLOYER && user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Employer or Admin role required" },
        { status: 403 }
      );
    }

    console.log('✅ [EMPLOYER/INVOICES] User authenticated:', user.email, 'Role:', user.role);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause based on role
    const where: any = {};

    if (user.role === UserRole.EMPLOYER) {
      // Employers can only see their own company's placements
      const employer = await prisma.employer.findUnique({
        where: { userId: user.id },
      });

      if (!employer) {
        return NextResponse.json({
          invoices: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        });
      }

      where.employerId = employer.id;
    }

    // Filter by payment status if provided
    if (statusFilter) {
      where.paymentStatus = statusFilter;
    }

    // Get placements (which serve as invoices)
    const [placements, totalCount] = await Promise.all([
      prisma.placement.findMany({
        where,
        include: {
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
          job: {
            select: {
              title: true,
              type: true,
            },
          },
          employer: {
            select: {
              companyName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.placement.count({ where }),
    ]);

    console.log('✅ [EMPLOYER/INVOICES] Found', placements.length, 'placements');

    // Transform placements into invoice format
    // Each placement can have 2 invoices: upfront (50%) and remaining (50%)
    const invoices = placements.flatMap((placement) => {
      const items = [];

      // Upfront invoice (50%)
      items.push({
        id: `${placement.id}-upfront`,
        placementId: placement.id,
        invoiceNumber: `INV-${placement.id.slice(0, 8).toUpperCase()}-UP`,
        amount: placement.upfrontAmount || 0,
        status: placement.upfrontPaidAt ? "PAID" : "PENDING",
        dueDate: placement.startDate,
        paidAt: placement.upfrontPaidAt,
        createdAt: placement.createdAt,
        placement: {
          candidate: {
            user: {
              name: placement.candidate.user.name,
            },
          },
          job: {
            title: placement.job.title,
          },
        },
        description: "Upfront Payment (50%)",
      });

      // Remaining invoice (50%)
      // Calculate due date as 30 days after start date
      const remainingDueDate = new Date(placement.startDate);
      remainingDueDate.setDate(remainingDueDate.getDate() + 30);

      items.push({
        id: `${placement.id}-remaining`,
        placementId: placement.id,
        invoiceNumber: `INV-${placement.id.slice(0, 8).toUpperCase()}-RM`,
        amount: placement.remainingAmount || 0,
        status: placement.remainingPaidAt ? "PAID" : "PENDING",
        dueDate: remainingDueDate,
        paidAt: placement.remainingPaidAt,
        createdAt: placement.createdAt,
        placement: {
          candidate: {
            user: {
              name: placement.candidate.user.name,
            },
          },
          job: {
            title: placement.job.title,
          },
        },
        description: "Remaining Payment (50%)",
      });

      return items;
    });

    // Calculate statistics
    const stats = {
      total: invoices.length,
      pending: invoices.filter((i) => i.status === "PENDING").length,
      paid: invoices.filter((i) => i.status === "PAID").length,
      overdue: invoices.filter(
        (i) => i.status === "PENDING" && new Date(i.dueDate) < new Date()
      ).length,
      totalAmount: invoices.reduce((sum, i) => sum + i.amount, 0),
      pendingAmount: invoices
        .filter((i) => i.status === "PENDING")
        .reduce((sum, i) => sum + i.amount, 0),
      paidAmount: invoices
        .filter((i) => i.status === "PAID")
        .reduce((sum, i) => sum + i.amount, 0),
    };

    const totalPages = Math.ceil(totalCount * 2 / limit); // *2 because each placement has 2 invoices

    return NextResponse.json({
      invoices,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount * 2, // Each placement generates 2 invoices
        totalPages,
      },
    });
  } catch (error) {
    console.error("❌ [EMPLOYER/INVOICES] Error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Employer or Admin role required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch invoices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
