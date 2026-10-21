/**
 * Copy a recruiter pastes into a job board they are logged into themselves.
 * External posting URLs stay empty until the recruiter supplies the live URL.
 */

export type ManualChannelId =
  | "NAUKRI"
  | "FOUNDIT"
  | "INSTAHYRE"
  | "APNA"
  | "WORKINDIA"
  | "INTERNSHALA"
  | "WELLFOUND"
  | "CUTSHORT"
  | "LINKEDIN";

export type ManualChannelKit = {
  id: ManualChannelId;
  label: string;
  trackedApplyUrl: string | null;
  utm: { source: string; medium: string; campaign: string } | null;
  description: string;
  instructions: string[];
  /** Always null. A live board URL is entered by the recruiter after they post. */
  externalPostingUrl: null;
  /** Recruiter confirmation is not a provider-verified posting. */
  verification: "recruiter_confirmed_when_url_supplied";
};

const CHANNELS: Array<{
  id: ManualChannelId;
  label: string;
  source: string;
  instructions: string[];
}> = [
  {
    id: "NAUKRI",
    label: "Naukri",
    source: "naukri",
    instructions: [
      "Post in the employer’s own Naukri Recruiter account. The hiring company is the client, not HireIQ.",
      "Company URL / response URL: paste the tracked apply link so applicants land on this job’s HireIQ form.",
      "Email response: Naukri can also send applications to a job inbox. That option stays unconfigured until an inbound-email provider is connected. Do not invent a response address.",
      "After the job is live, paste the posting URL Naukri shows you. HireIQ does not create that URL.",
    ],
  },
  {
    id: "FOUNDIT",
    label: "Foundit",
    source: "foundit",
    instructions: [
      "Create the job in the employer’s Foundit account and paste the tracked apply link as the application URL.",
      "Copy the description below. After Foundit publishes the job, paste the live Foundit URL back here.",
    ],
  },
  {
    id: "INSTAHYRE",
    label: "Instahyre",
    source: "instahyre",
    instructions: [
      "Publish from the employer’s Instahyre dashboard. Use the tracked apply link.",
      "Paste the live Instahyre job URL after you can open it. A saved kit is not a posted job.",
    ],
  },
  {
    id: "APNA",
    label: "apna",
    source: "apna",
    instructions: [
      "Post from the employer’s apna account. Use the tracked apply link as the application destination.",
      "Paste the live apna URL only after the job is visible in that account.",
    ],
  },
  {
    id: "WORKINDIA",
    label: "WorkIndia",
    source: "workindia",
    instructions: [
      "Post from the employer’s WorkIndia account and use the tracked apply link.",
      "Paste the live WorkIndia URL after posting. HireIQ cannot see that page for you.",
    ],
  },
  {
    id: "INTERNSHALA",
    label: "Internshala",
    source: "internshala",
    instructions: [
      "Use this for internship postings in the employer’s Internshala account.",
      "Paste the tracked apply link, then paste the live Internshala URL after the internship is published.",
    ],
  },
  {
    id: "WELLFOUND",
    label: "Wellfound",
    source: "wellfound",
    instructions: [
      "Post on the client company’s Wellfound profile, not a HireIQ profile.",
      "Use the tracked apply link. Paste the live Wellfound job URL after it exists.",
    ],
  },
  {
    id: "CUTSHORT",
    label: "Cutshort",
    source: "cutshort",
    instructions: [
      "The Cutshort employer API is not connected. Post manually in the employer’s Cutshort account if you have access.",
      "Paste the tracked apply link. A posting is recorded here only after you paste the live Cutshort URL.",
    ],
  },
  {
    id: "LINKEDIN",
    label: "LinkedIn (manual)",
    source: "linkedin",
    instructions: [
      "Use the client company’s LinkedIn Page. Do not post the job as HireIQ.",
      "Turn off Easy Apply when LinkedIn asks, and set the external apply URL to the tracked link.",
      "The LinkedIn XML feed is separate and stays off until this company enables it with a LinkedIn company ID and poster email.",
      "Paste the linkedin.com job URL after the post is live. That confirmation is yours, not a partner sync.",
    ],
  },
];

export function trackedApplyUrl(applyUrl: string, source: string, distributionId: number) {
  const url = new URL(applyUrl);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "job_board");
  url.searchParams.set("utm_campaign", `dist-${distributionId}`);
  return url.toString();
}

export function buildManualPostKit(input: {
  jobTitle: string;
  description: string;
  applyUrl: string | null;
  distributionId: number | null;
}): {
  jobTitle: string;
  description: string;
  inboundEmail: null;
  inboundEmailStatus: "unconfigured";
  channels: ManualChannelKit[];
} {
  return {
    jobTitle: input.jobTitle.trim(),
    description: input.description.trim(),
    inboundEmail: null,
    inboundEmailStatus: "unconfigured",
    channels: CHANNELS.map((channel) => {
      const canTrack =
        Boolean(input.applyUrl) &&
        input.distributionId != null &&
        input.distributionId > 0;
      let tracked: string | null = null;
      if (canTrack && input.applyUrl) {
        try {
          tracked = trackedApplyUrl(
            input.applyUrl,
            channel.source,
            input.distributionId!,
          );
        } catch {
          tracked = null;
        }
      }
      return {
        id: channel.id,
        label: channel.label,
        trackedApplyUrl: tracked,
        utm: tracked
          ? {
              source: channel.source,
              medium: "job_board",
              campaign: `dist-${input.distributionId}`,
            }
          : null,
        description: input.description.trim(),
        instructions: channel.instructions,
        externalPostingUrl: null,
        verification: "recruiter_confirmed_when_url_supplied",
      };
    }),
  };
}
