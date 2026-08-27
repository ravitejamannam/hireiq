import type { PortalRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: PortalRole;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: PortalRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: PortalRole;
    pwdAt?: number;
    error?: "revoked";
  }
}
