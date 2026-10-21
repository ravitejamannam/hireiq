import { describe, expect, it } from "vitest";

import { publicHostedDistributionWhere } from "@/lib/jobs/public-feed/public-feed-service";
import {
  eligibleLinkedInJobs,
  jobsFeedXml,
  linkedInFeedConfigurationError,
  linkedInFeedXml,
  type CompanyFeedJob,
} from "@/lib/jobs/public-feed/company-feed";
import { buildJobPostingJsonLd, serializeJsonLd } from "@/lib/jobs/public-feed/job-posting-jsonld";
import {
  companySlugMatches,
  distributionIdFromPublicSlug,
  publicJobSlug,
} from "@/lib/jobs/public-feed/public-job-slug";
import { toCanonicalJobPosting } from "@/lib/jobs/public-feed/canonical-job";
import { buildManualPostKit } from "@/lib/jobs/distribution/manual-post-kit";
import { validateJobQuality } from "@/lib/jobs/quality/job-quality";
import { sendIndexingNotification } from "@/lib/jobs/indexing/google-indexing";

const description = "A".repeat(160);

function job(overrides: Partial<CompanyFeedJob> = {}): CompanyFeedJob {
  return {
    externalRef: "dist-9",
    distributionId: 9,
    title: "Backend Engineer",
    companyName: "Nimbus Labs",
    companyPublicSlug: "nimbus",
    location: "Bengaluru, Karnataka, India",
    employmentType: "FULL_TIME",
    description,
    applyUrl: "https://hire.example/apply/token",
    datePosted: new Date("2026-03-01T00:00:00Z"),
    validThrough: new Date("2026-12-01T00:00:00Z"),
    remotePolicy: null,
    compensationRange: "₹1,800,000 - ₹2,400,000 per year",
    ...overrides,
  };
}

describe("job quality", () => {
  it("separates blocking errors from salary warnings", () => {
    const result = validateJobQuality({
      title: "Backend Engineer / Frontend Engineer",
      description: "Too short",
      location: "Bengaluru",
      companyName: "Nimbus Labs",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "MULTIPLE_DESIGNATIONS",
        "DESCRIPTION_TOO_SHORT",
        "LOCATION_INCOMPLETE",
      ]),
    );
    expect(result.warnings.map((issue) => issue.code)).toContain("SALARY_RECOMMENDED");
    expect(result.errors.some((issue) => issue.severity === "warning")).toBe(false);
  });

  it("accepts one designation with city, state, and country", () => {
    const result = validateJobQuality({
      title: "Nimbus Labs: Backend Engineer",
      companyName: "Nimbus Labs",
      description,
      location: "Bengaluru, Karnataka, India",
      compensationRange: "12-18 LPA",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires a country for remote roles and does not invent one", () => {
    const result = validateJobQuality({
      title: "Backend Engineer",
      description,
      location: "Remote",
      remote: true,
    });
    expect(result.errors.map((issue) => issue.code)).toContain("REMOTE_COUNTRY_REQUIRED");
  });
});

describe("JobPosting JSON-LD", () => {
  it("includes the required fields and the employer, not HireIQ", () => {
    const posting = buildJobPostingJsonLd({
      title: "Backend Engineer",
      companyName: "Nimbus Labs",
      description: `${description}\n<script>alert(1)</script>`,
      datePosted: new Date("2026-03-01T00:00:00Z"),
      validThrough: new Date("2026-12-01T00:00:00Z"),
      location: "Bengaluru, Karnataka, India",
      compensationRange: "₹1,800,000 - ₹2,400,000 per year",
      employmentType: "FULL_TIME",
      postingUrl: "https://hire.example/c/nimbus/jobs/backend-engineer-9",
      applyUrl: "https://hire.example/apply/token",
    });

    expect(posting["@type"]).toBe("JobPosting");
    expect(posting.title).toBe("Backend Engineer");
    expect(String(posting.description)).toContain("<p>");
    expect(String(posting.description)).not.toContain("<script>");
    expect(posting.datePosted).toBe("2026-03-01");
    expect(posting.validThrough).toBe("2026-12-01");
    expect(posting.hiringOrganization).toEqual({
      "@type": "Organization",
      name: "Nimbus Labs",
    });
    expect(posting.jobLocation).toMatchObject({
      address: {
        addressLocality: "Bengaluru",
        addressRegion: "Karnataka",
        addressCountry: "India",
      },
    });
    expect(posting.baseSalary).toMatchObject({
      currency: "INR",
      value: { minValue: 1800000, maxValue: 2400000, unitText: "YEAR" },
    });
    expect(posting.directApply).toBe(true);
    expect(serializeJsonLd(posting)).not.toContain("<script>");
  });

  it("uses remote metadata and withholds directApply for another site", () => {
    const posting = buildJobPostingJsonLd({
      title: "Backend Engineer",
      companyName: "Nimbus Labs",
      description,
      datePosted: new Date("2026-03-01T00:00:00Z"),
      location: "Remote, India",
      postingUrl: "https://hire.example/c/nimbus/jobs/backend-engineer-9",
      applyUrl: "https://boards.example/apply",
    });
    expect(posting.jobLocationType).toBe("TELECOMMUTE");
    expect(posting.applicantLocationRequirements).toEqual({
      "@type": "Country",
      name: "India",
    });
    expect(posting.jobLocation).toBeUndefined();
    expect(posting.directApply).toBe(false);
    expect(posting.baseSalary).toBeUndefined();
  });
});

describe("public job routes", () => {
  it("keeps a slug inside the company that owns the distribution", () => {
    const slug = publicJobSlug("Backend Engineer", 9);
    expect(distributionIdFromPublicSlug(slug)).toBe(9);
    expect(companySlugMatches("nimbus", "nimbus")).toBe(true);
    expect(companySlugMatches("other-co", "nimbus")).toBe(false);
  });

  it("lists only published open hosted jobs", () => {
    expect(publicHostedDistributionWhere()).toMatchObject({
      status: "PUBLISHED",
      applyMode: "HIREIQ_HOSTED",
      job: { status: "OPEN" },
      pinnedSpecificationVersion: { status: "PUBLISHED" },
    });
  });
});

describe("company feeds", () => {
  it("escapes XML and stays disabled until configured", () => {
    const xml = jobsFeedXml({
      companyName: "Nimbus & Co",
      origin: "https://hire.example",
      jobs: [job({ title: "Engineer <platform>" })],
    });
    expect(xml).toContain("Nimbus &amp; Co");
    expect(xml).toContain("Engineer &lt;platform&gt;");
    expect(xml).not.toContain("Engineer <platform>");
    expect(
      linkedInFeedConfigurationError({
        enabled: false,
        companyId: null,
        posterEmail: null,
        companyName: "Nimbus",
        publisherUrl: "https://hire.example/c/nimbus/jobs",
      }),
    ).toBe("disabled");
    expect(
      linkedInFeedConfigurationError({
        enabled: true,
        companyId: "",
        posterEmail: "not-an-email",
        companyName: "Nimbus",
        publisherUrl: "https://hire.example/c/nimbus/jobs",
      }),
    ).toBe("incomplete");
  });

  it("omits ineligible jobs from the LinkedIn feed and does not invent a posting id", () => {
    const eligible = eligibleLinkedInJobs([
      job(),
      job({
        distributionId: 10,
        externalRef: "dist-10",
        description: "short",
        title: "Short role",
      }),
    ]);
    expect(eligible.map((item) => item.distributionId)).toEqual([9]);
    const xml = linkedInFeedXml({
      config: {
        enabled: true,
        companyId: "12345",
        posterEmail: "jobs@nimbus.example",
        companyName: "Nimbus Labs",
        publisherUrl: "https://hire.example/c/nimbus/jobs",
      },
      jobs: eligible,
      generatedAt: new Date("2026-03-02T00:00:00Z"),
    });
    expect(xml).toContain("dist-9");
    expect(xml).not.toContain("dist-10");
    expect(xml).toContain("jobs@nimbus.example");
    expect(xml).not.toContain("linkedin.com/jobs");
  });
});

describe("manual post kit", () => {
  it("does not fabricate a posting URL or inbound address", () => {
    const kit = buildManualPostKit({
      jobTitle: "Backend Engineer",
      description,
      applyUrl: "https://hire.example/apply/token",
      distributionId: 9,
    });
    expect(kit.inboundEmail).toBeNull();
    expect(kit.inboundEmailStatus).toBe("unconfigured");
    const naukri = kit.channels.find((channel) => channel.id === "NAUKRI");
    expect(naukri?.externalPostingUrl).toBeNull();
    expect(naukri?.trackedApplyUrl).toContain("utm_source=naukri");
    expect(naukri?.instructions.join(" ")).toMatch(/Company URL/);
    expect(naukri?.instructions.join(" ")).toMatch(/Email response/);
    expect(JSON.stringify(kit)).not.toMatch(/naukri\.com\/job\//);
  });
});

describe("Google indexing notifications", () => {
  it("does not call the network when indexing is not configured", async () => {
    let called = false;
    const result = await sendIndexingNotification({
      url: "https://hire.example/c/nimbus/jobs/backend-engineer-9",
      type: "URL_UPDATED",
      config: { configured: false, reason: "DISABLED" },
      fetchImpl: (async () => {
        called = true;
        throw new Error("should not be called");
      }) as typeof fetch,
    });
    expect(called).toBe(false);
    expect(result.status).toBe("UNCONFIGURED");
  });

  it("records a failure when Google rejects the notification", async () => {
    const result = await sendIndexingNotification({
      url: "https://hire.example/c/nimbus/jobs/backend-engineer-9",
      type: "URL_DELETED",
      config: {
        configured: true,
        clientEmail: "indexing@example.iam.gserviceaccount.com",
        privateKey: "not-a-key",
      },
      fetchImpl: (async () => {
        throw new Error("should not be called");
      }) as typeof fetch,
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SIGNING_FAILED");
  });
});

describe("canonical public job", () => {
  const row = {
    id: 9,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    applyUrlSnapshot: "https://hire.example/apply/token",
    includeCompensation: false,
    pinnedSpecificationVersion: {
      title: "Backend Engineer",
      location: "Bengaluru, Karnataka, India",
      jobDescription: description,
      mustHaveRequirements: null,
      publishedAt: new Date("2026-03-01T00:00:00Z"),
      structuredPayload: null,
      remotePolicy: null,
      compensationRange: "₹1,800,000 - ₹2,400,000 per year",
    },
    job: { company: { name: "Nimbus Labs", publicSlug: "nimbus" } },
  };

  it("omits withheld pay and does not treat the hire target as an expiration", () => {
    const posting = toCanonicalJobPosting({
      ...row,
      pinnedSpecificationVersion: {
        ...row.pinnedSpecificationVersion,
        targetHireDate: new Date("2026-12-01T00:00:00Z"),
      },
    } as Parameters<typeof toCanonicalJobPosting>[0]);
    expect(posting?.compensationRange).toBeNull();
    expect(posting?.validThrough).toBeNull();
  });

  it("keeps pay when the posting is allowed to show it", () => {
    const posting = toCanonicalJobPosting({
      ...row,
      includeCompensation: true,
    });
    expect(posting?.compensationRange).toBe("₹1,800,000 - ₹2,400,000 per year");
  });
});
