import "dotenv/config";
import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

import { verifyPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";

const base = process.env.SCREEN_BASE ?? "http://localhost:4013";
const email = "admin@hireiq.local";
const password = process.env.BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || "";

async function main() {
  if (!password) throw new Error("Missing admin password.");
  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, disabledAt: true } });
  const matches = user ? await verifyPassword(password, user.passwordHash) : false;
  console.log(JSON.stringify({ passwordMatchesDatabase: matches, disabled: Boolean(user?.disabledAt) }));
  await prisma.$disconnect();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/login`);
  await page.getByPlaceholder("you@company.com").pressSequentially(email);
  await page.getByPlaceholder("Enter your password").pressSequentially(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  } catch {
    const alert = await page.getByRole("alert").textContent().catch(() => null);
    console.log(JSON.stringify({ stayedOn: page.url(), alert }));
    throw new Error("Login did not leave the login page.");
  }
  mkdirSync("/tmp/hireiq-roadmap-screens", { recursive: true });
  const pages = [
    ["analytics", "/dashboard/analytics?lang=hi&q=time%20to%20hire%20from%20naukri"],
    ["training", "/dashboard/training"],
    ["outreach", "/dashboard/outreach"],
    ["assessment-ai", "/dashboard/assessments/ai"],
  ] as const;
  for (const [name, path] of pages) {
    const response = await page.goto(`${base}${path}`);
    await page.screenshot({ path: `/tmp/hireiq-roadmap-screens/${name}.png`, fullPage: true });
    console.log(JSON.stringify({ name, url: page.url(), status: response?.status() ?? null }));
  }
  await browser.close();
}

main();
