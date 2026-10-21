import { escapeXml } from "@/lib/jobs/public-feed/canonical-job";
import type { CanonicalJobPosting } from "@/lib/jobs/public-feed/canonical-job";
import { descriptionHtml } from "@/lib/jobs/public-feed/job-posting-jsonld";
import {
  interpretWorkplace,
  validateJobQuality,
} from "@/lib/jobs/quality/job-quality";

export type CompanyFeedJob = CanonicalJobPosting & {
  compensationRange?: string | null;
  remotePolicy?: string | null;
};

export type LinkedInFeedConfig = {
  enabled: boolean;
  companyId: string | null;
  posterEmail: string | null;
  companyName: string;
  publisherUrl: string;
};

export function cdata(value: string) {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

export function jobsFeedXml(input: {
  companyName: string;
  origin: string;
  jobs: CompanyFeedJob[];
}) {
  const items = input.jobs
    .map((job) => {
      const workplace = interpretWorkplace({
        location: job.location,
        remotePolicy: job.remotePolicy,
      });
      return `    <item>
      <title>${escapeXml(job.title)}</title>
      <company>${escapeXml(job.companyName)}</company>
      <description>${escapeXml(job.description)}</description>
      <url>${escapeXml(job.applyUrl)}</url>
      <reference>${escapeXml(job.externalRef)}</reference>
      <datePosted>${job.datePosted.toISOString()}</datePosted>${
        job.validThrough
          ? `\n      <validThrough>${job.validThrough.toISOString()}</validThrough>`
          : ""
      }${job.location ? `\n      <location>${escapeXml(job.location)}</location>` : ""}${
        workplace.remote ? "\n      <workplace>remote</workplace>" : ""
      }
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(input.companyName)} jobs</title>
    <link>${escapeXml(input.origin)}</link>
    <description>Open roles at ${escapeXml(input.companyName)}. Generating this feed is not provider approval.</description>
${items}
  </channel>
</rss>
`;
}

export function linkedInFeedConfigurationError(config: LinkedInFeedConfig): string | null {
  if (!config.enabled) return "disabled";
  if (!config.companyId?.trim() || !config.posterEmail?.trim()) {
    return "incomplete";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.posterEmail.trim())) {
    return "incomplete";
  }
  if (!/^https?:\/\//i.test(config.publisherUrl)) return "incomplete";
  return null;
}

/** Employer-direct jobs that pass publication quality. Others are omitted. */
export function eligibleLinkedInJobs(jobs: CompanyFeedJob[]) {
  return jobs.filter((job) => {
    const workplace = interpretWorkplace({
      location: job.location,
      remotePolicy: job.remotePolicy,
    });
    const quality = validateJobQuality({
      title: job.title,
      description: job.description,
      companyName: job.companyName,
      location: job.location,
      remotePolicy: job.remotePolicy,
      compensationRange: job.compensationRange,
      channel: "LINKEDIN_FEED",
    });
    if (!quality.ok) return false;
    try {
      const apply = new URL(job.applyUrl);
      if (apply.protocol !== "https:" && apply.protocol !== "http:") return false;
    } catch {
      return false;
    }
    if (workplace.remote) return Boolean(workplace.country);
    return Boolean(workplace.city && workplace.region && workplace.country);
  });
}

export function linkedInFeedXml(input: {
  config: LinkedInFeedConfig;
  jobs: CompanyFeedJob[];
  generatedAt: Date;
}) {
  const jobs = eligibleLinkedInJobs(input.jobs);
  const blocks = jobs
    .map((job) => {
      const workplace = interpretWorkplace({
        location: job.location,
        remotePolicy: job.remotePolicy,
      });
      const location = [workplace.city, workplace.region, workplace.country]
        .filter(Boolean)
        .join(", ");
      return `  <job>
    <partnerJobId>${cdata(job.externalRef)}</partnerJobId>
    <company>${cdata(job.companyName)}</company>
    <title>${cdata(job.title)}</title>
    <description>${cdata(descriptionHtml(job.description))}</description>
    <applyUrl>${cdata(job.applyUrl)}</applyUrl>
    <companyId>${cdata(input.config.companyId!.trim())}</companyId>
    <posterEmail>${cdata(input.config.posterEmail!.trim())}</posterEmail>
    <listDate>${cdata(job.datePosted.toISOString().slice(0, 10))}</listDate>${
      location ? `\n    <location>${cdata(location)}</location>` : ""
    }${workplace.city ? `\n    <city>${cdata(workplace.city)}</city>` : ""}${
      workplace.region ? `\n    <state>${cdata(workplace.region)}</state>` : ""
    }${workplace.country ? `\n    <country>${cdata(workplace.country)}</country>` : ""}${
      workplace.remote ? "\n    <workplaceTypes>Remote</workplaceTypes>" : ""
    }${
      job.validThrough
        ? `\n    <expirationDate>${cdata(job.validThrough.toISOString().slice(0, 10))}</expirationDate>`
        : ""
    }
  </job>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>${cdata(input.config.companyName)}</publisher>
  <publisherUrl>${cdata(input.config.publisherUrl)}</publisherUrl>
  <lastBuildDate>${cdata(input.generatedAt.toUTCString())}</lastBuildDate>
${blocks}
</source>
`;
}
