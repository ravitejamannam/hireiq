import { DistributionProvider } from "@prisma/client";

import type { JobDistributionProviderAdapter } from "@/lib/jobs/distribution/adapter";
import { IndeedProvider } from "@/lib/jobs/distribution/indeed/indeed-provider";
import { LinkedInProvider } from "@/lib/jobs/distribution/linkedin/linkedin-provider";
import { ManualProvider } from "@/lib/jobs/distribution/manual-provider";
import { NaukriProvider } from "@/lib/jobs/distribution/naukri/naukri-provider";

const adapters: Record<DistributionProvider, JobDistributionProviderAdapter> = {
  LINKEDIN: new LinkedInProvider(),
  INDEED: new IndeedProvider(),
  NAUKRI: new NaukriProvider(),
  MANUAL: new ManualProvider(),
};

let adapterOverride: Partial<
  Record<DistributionProvider, JobDistributionProviderAdapter>
> = {};

export function getDistributionAdapter(
  provider: DistributionProvider,
): JobDistributionProviderAdapter {
  return adapterOverride[provider] ?? adapters[provider];
}

export function setDistributionAdapterForTests(
  provider: DistributionProvider,
  adapter: JobDistributionProviderAdapter | null,
) {
  if (adapter) {
    adapterOverride[provider] = adapter;
    return;
  }

  delete adapterOverride[provider];
}

export function resetDistributionAdaptersForTests() {
  adapterOverride = {};
}

export function providerRequiresActiveConnection(
  provider: DistributionProvider,
) {
  return provider !== DistributionProvider.MANUAL;
}
