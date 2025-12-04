import NextAuth, { AuthOptions, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

// Define the user type for NextAuth
interface ExtendedUser extends NextAuthUser {
  role: UserRole;
  status: string;
}

// Session durations
const SESSION_MAX_AGE_DEFAULT = 24 * 60 * 60; // 1 day (when not remembering)
const SESSION_MAX_AGE_REMEMBER = 30 * 24 * 60 * 60; // 30 days (when remembering)

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials): Promise<ExtendedUser | null> {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        if (!user) {
          throw new Error("No user found with this email");
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          throw new Error("Your account is not active. Please contact support.");
        }

        // Verify password
        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error("Invalid password");
        }

        // Return user object with rememberMe flag (password excluded)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          status: user.status,
          rememberMe: credentials.rememberMe === "true",
        } as ExtendedUser & { rememberMe: boolean };
      },
    }),
  ],

  // Use JWT strategy for sessions
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // JWT configuration
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Callbacks to add custom data to session
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to token on sign in
      if (user) {
        const extendedUser = user as ExtendedUser & { rememberMe?: boolean };
        token.id = extendedUser.id;
        token.role = extendedUser.role;
        token.status = extendedUser.status;
        token.rememberMe = extendedUser.rememberMe || false;

        // Set token expiration based on rememberMe
        const maxAge = extendedUser.rememberMe ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT;
        token.exp = Math.floor(Date.now() / 1000) + maxAge;
      }
      return token;
    },

    async session({ session, token }) {
      // Add user data from token to session
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.status = token.status as string;
      }

      // Adjust session expiry based on rememberMe
      if (token.rememberMe) {
        session.expires = new Date(Date.now() + SESSION_MAX_AGE_REMEMBER * 1000).toISOString();
      }

      return session;
    },
  },

  // No custom pages - backend is API only
  // Authentication is handled by frontend
  pages: undefined,

  // Enable debug messages in development
  debug: process.env.NODE_ENV === "development",

  // Secret for JWT
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

// Export for App Router
export { handler as GET, handler as POST };
