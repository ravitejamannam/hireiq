import type { NextAuthConfig } from "next-auth";

import { homePathForRole } from "@/lib/auth/routes";
import { PortalRole } from "@prisma/client";

function homePathFromSessionRole(role: string | undefined) {
  if (role === PortalRole.CLIENT) {
    return homePathForRole(PortalRole.CLIENT);
  }

  if (role === PortalRole.INTERVIEWER) {
    return homePathForRole(PortalRole.INTERVIEWER);
  }

  return homePathForRole(PortalRole.ADMIN);
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;
      const pathname = nextUrl.pathname;
      const isOnDashboard = pathname.startsWith("/dashboard");
      const isOnClient = pathname.startsWith("/client");
      const isOnInterviewer = pathname.startsWith("/interviewer");

      const isOnOnboarding = pathname.startsWith("/onboarding");
      const isOnPostAuth = pathname === "/post-auth";
      const isOnVerifyEmail = pathname === "/verify-email";

      if (
        isOnDashboard ||
        isOnClient ||
        isOnInterviewer ||
        isOnOnboarding ||
        isOnPostAuth ||
        isOnVerifyEmail
      ) {
        if (!isLoggedIn) {
          return false;
        }
      }

      if (isLoggedIn && pathname === "/login") {
        return Response.redirect(
          new URL(homePathFromSessionRole(role), nextUrl),
        );
      }

      if (isLoggedIn && pathname === "/signup") {
        return Response.redirect(
          new URL(homePathFromSessionRole(role), nextUrl),
        );
      }

      if (isLoggedIn && isOnDashboard) {
        if (role === PortalRole.CLIENT) {
          return Response.redirect(new URL("/post-auth", nextUrl));
        }
        if (role === PortalRole.INTERVIEWER) {
          return Response.redirect(new URL("/interviewer", nextUrl));
        }
      }

      if (isLoggedIn && isOnClient && role !== PortalRole.CLIENT) {
        return Response.redirect(
          new URL(homePathFromSessionRole(role), nextUrl),
        );
      }

      if (isLoggedIn && isOnInterviewer && role !== PortalRole.INTERVIEWER) {
        return Response.redirect(
          new URL(homePathFromSessionRole(role), nextUrl),
        );
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
