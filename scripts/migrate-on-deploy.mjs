import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv === "preview" || vercelEnv === "development") {
  console.log(
    `Skipping prisma migrate deploy (VERCEL_ENV=${vercelEnv}). Preview builds do not migrate the shared database.`,
  );
  process.exit(0);
}

const env = { ...process.env };
if (env.DIRECT_URL?.trim()) {
  env.DATABASE_URL = env.DIRECT_URL.trim();
  console.log("prisma migrate deploy is using DIRECT_URL.");
}

const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
