"use client";

import Button from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">
        Welcome to HireIQ 🚀
      </h1>

      <Button
        label="Login"
        variant="primary"
        onClick={() => alert("Login clicked")}
      />

      <Button
        label="Delete Account"
        variant="danger"
        onClick={() => alert("Delete Account clicked")}
      />
    </main>
  );
}
