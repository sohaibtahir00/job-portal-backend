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
  "/api/candidates/search": [UserRole.EMPLOYER, UserRole.ADMIN], // Employer searches candidates
  "/api/candidates": [UserRole.CANDIDATE, UserRole.ADMIN], // Candidates manage their own profile
  "/api/applications": [UserRole.CANDIDATE, UserRole.ADMIN],

  // Common authenticated routes (all roles)
  "/dashboard": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
  "/api/profile": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
  "/api/messages": [UserRole.ADMIN, UserRole.EMPLOYER, UserRole.CANDIDATE],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get origin from request
  const origin = request.headers.get('origin') || '';

  // Allowed origins for CORS
  const allowedOrigins = [
    'https://jobportal-rouge-mu.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  // Check if origin is allowed
  const isAllowedOrigin = allowedOrigins.includes(origin);

  // Handle preflight OPTIONS requests for CORS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-User-Email, X-User-Role',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Exclude webhook routes from authentication (Stripe webhooks need to bypass auth)
  if (pathname.startsWith("/api/webhooks/")) {
    const response = NextResponse.next();
    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    return response;
  }

  // Check for custom authentication headers (for cross-domain requests)
  // Note: We only check if headers EXIST here, actual validation happens in route handlers
  // This allows cross-domain requests to bypass middleware auth and reach route handlers
  const userId = request.headers.get('X-User-Id');
  const userEmail = request.headers.get('X-User-Email');
  const userRole = request.headers.get('X-User-Role');

  const hasCustomHeaders = !!(userId && userEmail && userRole);
  const authenticatedUserRole = userRole as UserRole | null;

  // Get the token from the request (for same-domain requests)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Check if the route requires authentication
  const requiresAuth = Object.keys(protectedRoutes).some((route) =>
    pathname.startsWith(route)
  );

  // Check if user is authenticated via either method
  // For custom headers, we trust they exist and let route handlers validate them
  const isAuthenticated = hasCustomHeaders || !!token;

  // If route requires auth but user is not authenticated via either method
  if (requiresAuth && !isAuthenticated) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(signInUrl);

    // Add CORS headers
    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;
  }

  // Special case: /api/applications/bulk is for employers, not candidates
  // Let the route handler handle authorization instead of middleware
  if (pathname === "/api/applications/bulk" || pathname.startsWith("/api/applications/bulk/")) {
    const response = NextResponse.next();
    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-User-Email, X-User-Role');
    }
    return response;
  }

  // If user is authenticated, check role-based access
  if (isAuthenticated) {
    // Get user role from either token or header authentication
    const currentUserRole = (authenticatedUserRole || token?.role) as UserRole;

    // Check if user's account is active (for token-based auth)
    if (token && token.status !== "ACTIVE") {
      const errorUrl = new URL("/auth/error", request.url);
      errorUrl.searchParams.set("error", "AccountInactive");
      const response = NextResponse.redirect(errorUrl);

      // Add CORS headers
      if (isAllowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }

      return response;
    }

    // Find matching protected route
    // Sort routes by length (longest first) to match most specific routes first
    const sortedRoutes = Object.entries(protectedRoutes).sort(([a], [b]) => b.length - a.length);

    for (const [route, allowedRoles] of sortedRoutes) {
      if (pathname.startsWith(route)) {
        // Check if user has required role
        if (!allowedRoles.includes(currentUserRole)) {
          // For API requests (like from frontend), return 403 instead of redirecting
          if (pathname.startsWith("/api/")) {
            return new NextResponse(
              JSON.stringify({ error: `Forbidden - ${allowedRoles.join(" or ")} role required` }),
              {
                status: 403,
                headers: {
                  'Content-Type': 'application/json',
                  ...(isAllowedOrigin && {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                  }),
                },
              }
            );
          }

          // Redirect to appropriate dashboard based on role (for page requests)
          let redirectPath = "/";

          switch (currentUserRole) {
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

          const response = NextResponse.redirect(new URL(redirectPath, request.url));

          // Add CORS headers
          if (isAllowedOrigin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
          }

          return response;
        }
        break;
      }
    }

    // Redirect authenticated users from auth pages to their dashboard (only for page requests)
    if (pathname.startsWith("/auth/signin") || pathname.startsWith("/auth/signup")) {
      let dashboardPath = "/dashboard";

      switch (currentUserRole) {
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

      const response = NextResponse.redirect(new URL(dashboardPath, request.url));

      // Add CORS headers
      if (isAllowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }

      return response;
    }
  }

  // Allow the request to proceed with CORS headers
  const response = NextResponse.next();

  // Add CORS headers to all responses
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-User-Email, X-User-Role');
  }

  return response;
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
