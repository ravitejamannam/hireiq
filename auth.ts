import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { PortalRole } from "@prisma/client";

import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/auth/password";
import { getUserCredentialsByEmail } from "@/lib/repositories/user-repository";
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
      async authorize(credentials) {
        try {
          const { email, password } = validateLoginCredentials({
            email: credentials?.email,
            password: credentials?.password,
          });

          const user = await getUserCredentialsByEmail(email);

          if (!user) {
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
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.email = user.email;
        token.name = user.name;
      }

      return token;
    },
    async session({ session, token }) {
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
