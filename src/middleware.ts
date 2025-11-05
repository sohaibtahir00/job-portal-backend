import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { UserRole } from "@prisma/client";

// Define protected routes and their required roles
const protectedRoutes: Record<string, UserRole[]> = {
  // Admin routes
  "/dashboard/admin": [UserRole.ADMIN],
  "/api/admin": [UserRole.ADMIN],

  // Employer routes
  "/dashboard/employer": [UserRole.EMPLOYER, UserRole.ADMIN],
  "/api/employer": [UserRole.EMPLOYER, UserRole.ADMIN],
  "/api/jobs/create": [UserRole.EMPLOYER, UserRole.ADMIN],
  "/api/jobs/[id]/edit": [UserRole.EMPLOYER, UserRole.ADMIN],
  "/api/email-campaigns": [UserRole.EMPLOYER, UserRole.ADMIN],

  // Candidate routes
  "/dashboard/candidate": [UserRole.CANDIDATE, UserRole.ADMIN],
  "/api/candidate": [UserRole.CANDIDATE, UserRole.ADMIN],
  "/api/applications": [UserRole.CANDIDATE, UserRole.ADMIN],

  // Common authenticated routes (all roles)
  "/dashboard": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
  "/api/profile": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
  "/api/messages": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude webhook routes from authentication (Stripe webhooks need to bypass auth)
  if (pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  // Get the token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Check if the route requires authentication
  const requiresAuth = Object.keys(protectedRoutes).some((route) =>
    pathname.startsWith(route)
  );

  // If route requires auth but user is not authenticated
  if (requiresAuth && !token) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // If user is authenticated, check role-based access
  if (token) {
    const userRole = token.role as UserRole;

    // Check if user's account is active
    if (token.status !== "ACTIVE") {
      const errorUrl = new URL("/auth/error", request.url);
      errorUrl.searchParams.set("error", "AccountInactive");
      return NextResponse.redirect(errorUrl);
    }

    // Find matching protected route
    for (const [route, allowedRoles] of Object.entries(protectedRoutes)) {
      if (pathname.startsWith(route)) {
        // Check if user has required role
        if (!allowedRoles.includes(userRole)) {
          // Redirect to appropriate dashboard based on role
          let redirectPath = "/";

          switch (userRole) {
            case UserRole.ADMIN:
              redirectPath = "/dashboard/admin";
              break;
            case UserRole.EMPLOYER:
              redirectPath = "/dashboard/employer";
              break;
            case UserRole.CANDIDATE:
              redirectPath = "/dashboard/candidate";
              break;
          }

          return NextResponse.redirect(new URL(redirectPath, request.url));
        }
        break;
      }
    }

    // Redirect authenticated users from auth pages to their dashboard
    if (pathname.startsWith("/auth/signin") || pathname.startsWith("/auth/signup")) {
      let dashboardPath = "/dashboard";

      switch (userRole) {
        case UserRole.ADMIN:
          dashboardPath = "/dashboard/admin";
          break;
        case UserRole.EMPLOYER:
          dashboardPath = "/dashboard/employer";
          break;
        case UserRole.CANDIDATE:
          dashboardPath = "/dashboard/candidate";
          break;
      }

      return NextResponse.redirect(new URL(dashboardPath, request.url));
    }
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
