import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("/tmp/hireiq-playwright.json", "utf8")) as {
  adminEmail: string;
  interviewerEmail: string;
  password: string;
  reviewJobId: number;
  otherJobId: number;
  applicationId: number;
  portalUrl: string | null;
};

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("company admin can use the review queue and cannot open the other company", async ({ page }) => {
  await signIn(page, fixture.adminEmail);
  await page.goto(`/dashboard/jobs/${fixture.reviewJobId}/review`);
  await expect(page.getByRole("heading", { name: /Backend Engineer/ })).toBeVisible();
  await page.locator("[tabindex='0']").first().focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/selected=/);
  const box = page.getByRole("checkbox").nth(1);
  await box.check();
  await page.getByRole("button", { name: "Advance" }).click();
  await expect(page.getByText("Stage EXPERT_REVIEW")).toBeVisible();

  const foreign = await page.goto(`/dashboard/jobs/${fixture.otherJobId}/review`);
  expect(foreign?.status()).toBe(404);

  const slots = await page.request.post("/api/scheduling/slots", {
    data: {
      jobId: fixture.otherJobId,
      interviewerId: 1,
      interviewType: "TECHNICAL",
      slots: [{ startAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 45 }],
    },
  });
  expect(slots.ok()).toBe(false);
});

test("interviewer can open a scorecard for their job", async ({ page }) => {
  await signIn(page, fixture.interviewerEmail);
  const response = await page.goto(`/interviewer/requirements/${fixture.reviewJobId}/candidates/${fixture.applicationId}`);
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByText(/score|rubric|feedback/i).first()).toBeVisible();
});

test("candidate portal opens from a magic link", async ({ page }) => {
  test.skip(!fixture.portalUrl, "No portal link was issued");
  await page.goto(fixture.portalUrl!);
  await expect(page.getByText(/application|Nimbus|sign/i).first()).toBeVisible();
});
