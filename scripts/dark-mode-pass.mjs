/**
 * Sign in as the local admin and screenshot the main pages in dark mode.
 * Reads ADMIN_PASSWORD from .env and does not print it.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

function envValue(name) {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    if (line.startsWith(`${name}=`)) return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  }
  return "";
}

const password = envValue("ADMIN_PASSWORD") || envValue("BOOTSTRAP_PASSWORD");
if (!password) throw new Error("ADMIN_PASSWORD missing");

const out = "/tmp/hireiq-dark";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("hireiq-theme", "dark");
  document.documentElement.dataset.theme = "dark";
});
await page.goto("http://localhost:4000/login", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByPlaceholder("you@company.com").fill("admin@hireiq.local");
await page.getByPlaceholder("Enter your password").fill(password);
await page.getByRole("button", { name: "Sign In" }).click();
try {
  await page.waitForURL(/dashboard|post-auth|client/, { timeout: 90000 });
} catch {
  await page.screenshot({ path: `${out}/00-login-failed.png` });
  const body = await page.locator("body").innerText();
  console.log("still on", page.url());
  console.log(body.slice(0, 500).replace(/\s+/g, " "));
  throw new Error("sign-in did not leave the login page");
}
await page.screenshot({ path: `${out}/01-after-login.png`, fullPage: false });

const paths = [
  ["/dashboard", "02-dashboard"],
  ["/dashboard/requirements", "03-requirements"],
  ["/dashboard/companies", "04-companies"],
  ["/dashboard/interviewers", "05-interviewers"],
  ["/dashboard/pipeline", "06-pipeline"],
  ["/dashboard/applications", "07-applications"],
  ["/dashboard/billing", "08-billing"],
  ["/dashboard/analytics", "09-analytics"],
  ["/dashboard/audit", "10-audit"],
];

const notes = [];
for (const [path, name] of paths) {
  const response = await page.goto(`http://localhost:4000${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.waitForTimeout(300);
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const contrast = await page.evaluate(() => {
    const problems = [];
    const nodes = document.querySelectorAll("h1,h2,h3,p,a,button,label,td,th,span");
    for (const node of nodes) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const text = (node.innerText || "").trim();
      if (!text) continue;
      problems.push({
        text: text.slice(0, 40),
        color: style.color,
        background: style.backgroundColor,
      });
    }
    return {
      theme: document.documentElement.dataset.theme,
      sample: problems.slice(0, 8),
      url: location.pathname,
    };
  });
  notes.push({ path, status: response?.status() ?? 0, theme: contrast.theme, file });
  console.log(path, response?.status(), contrast.theme);
}
console.log(JSON.stringify(notes, null, 2));
await browser.close();
