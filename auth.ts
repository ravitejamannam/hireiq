import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { PortalRole } from "@prisma/client";

import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/auth/password";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForEmail,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { getUserCredentialsByEmail, getUserSessionGuard } from "@/lib/repositories/user-repository";
import {
  UserValidationError,
  validateLoginCredentials,
} from "@/lib/validation/user-validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        try {
          const { email, password } = validateLoginCredentials({
            email: credentials?.email,
            password: credentials?.password,
          });

          const ip =
            request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request?.headers?.get("x-real-ip")?.trim() ||
            "unknown";

          await consumeAuthRateLimit({
            name: "loginEmail",
            key: rateLimitKeyForEmail(email),
          });
          await consumeAuthRateLimit({
            name: "loginIp",
            key: rateLimitKeyForIp(ip),
          });

          const user = await getUserCredentialsByEmail(email);

          if (!user || user.disabledAt) {
            return null;
          }

          const passwordMatches = await verifyPassword(
            password,
            user.passwordHash,
          );

          if (!passwordMatches) {
            return null;
          }

          return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          if (error instanceof RateLimitError) {
            return null;
          }

          if (error instanceof UserValidationError) {
            return null;
          }

          throw error;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (token.error === "revoked" && !user) {
        return token;
      }

      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.email = user.email;
        token.name = user.name;
        token.pwdAt = Date.now();
        delete token.error;
      }

      // Middleware/proxy runs on the Edge runtime — no Prisma.
      if (process.env.NEXT_RUNTIME === "edge") {
        return token;
      }

      const userId = Number(token.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return { ...token, error: "revoked" as const };
      }

      const guard = await getUserSessionGuard(userId);
      if (!guard || guard.disabledAt) {
        return { ...token, error: "revoked" as const };
      }
      if (user) {
        token.pwdAt = guard.passwordChangedAt?.getTime() ?? Date.now();
        return token;
      }
      if (
        guard.passwordChangedAt &&
        typeof token.pwdAt === "number" &&
        guard.passwordChangedAt.getTime() > token.pwdAt
      ) {
        return { ...token, error: "revoked" as const };
      }

      return token;
    },
    async session({ session, token }) {
      if (token.error === "revoked" || !token.id) {
        return { ...session, user: undefined as never };
      }
      if (session.user) {
        session.user.id = String(token.id);
        session.user.email = typeof token.email === "string" ? token.email : "";
        session.user.name = typeof token.name === "string" ? token.name : "";
        session.user.role = token.role as PortalRole;
      }

      return session;
    },
  },
});
