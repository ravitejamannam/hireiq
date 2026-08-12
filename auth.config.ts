import type { NextAuthConfig } from "next-auth";

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

      if (isOnDashboard || isOnClient) {
        if (!isLoggedIn) {
          return false;
        }
      }

      if (isLoggedIn && pathname === "/login") {
        const destination = role === "CLIENT" ? "/client" : "/dashboard";
        return Response.redirect(new URL(destination, nextUrl));
      }

      if (isLoggedIn && isOnDashboard && role === "CLIENT") {
        return Response.redirect(new URL("/client", nextUrl));
      }

      if (isLoggedIn && isOnClient && role !== "CLIENT") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
