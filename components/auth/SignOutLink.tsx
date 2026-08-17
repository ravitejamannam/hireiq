"use client";

import { signOut } from "next-auth/react";

export default function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => {
        void signOut({ callbackUrl: "/login" });
      }}
      className="text-sm font-medium text-zinc-600 hover:text-black hover:underline"
    >
      Sign out
    </button>
  );
}
